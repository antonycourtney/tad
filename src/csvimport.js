/* @flow */
/**
 * Import CSV files into sqlite
 */

import type {ColumnType, ColumnMetaMap, TableInfo} from './reltab'
import {Schema} from './reltab' // eslint-disable-line
import csv from 'fast-csv'
import * as _ from 'lodash'
import * as path from 'path'
import * as stream from 'stream'
import through from 'through'
import * as fs from 'fs'
import byline from 'byline'
import db from 'sqlite'
import Gauge from 'gauge'

const log = require('electron-log')

const CSVSniffer = require('csv-sniffer')()

const delimChars = [',', '\t', '|', ';']
const sniffer = new CSVSniffer(delimChars)

/*
 * regex to match a float or int:
 * allows commas and leading $
 */
const usIntRE = /[-+]?[$]?[0-9,]+/
const usRealRE = /[-+]?[$]?[0-9,]*\.?[0-9]+([eE][-+]?[0-9]+)?/

const usNumREs = {
  intRE: usIntRE,
  realRE: usRealRE
}

// adaptations of these REs for European format, where the
// use of , and . are reversed:
const eurIntRE = /[-+]?[$]?[0-9.]+/
const eurRealRE = /[-+]?[$]?[0-9.]*,?[0-9]+([eE][-+]?[0-9]+)?/

const eurNumREs = {
  intRE: eurIntRE,
  realRE: eurRealRE
}

/*
 * FileMetaData is an array of unique column IDs, column display names and
 * ColumnType for each column in a CSV file.
 * The possible null for ColumnType deals with an empty file (no rows)
 *
 */
export type FileMetadata = {
  columnIds: Array<string>,
  columnNames: Array<string>,
  columnTypes: Array<?ColumnType>,
  rowCount: number,
  tableName: string,
  csvOptions: Object
}

function assertDefined<A> (x: ?A): A {
  if (x == null) {
    throw new Error('unexpected null value')
  }
  return x
}

export const mkTableInfo = (md: FileMetadata): TableInfo => {
  const extendCMap = (cmm: ColumnMetaMap,
        cnm: string, idx: number): ColumnMetaMap => {
    const cType = md.columnTypes[idx]
    if (cType == null) {
      log.error('mkTableInfo: No column type for "' + cnm + '", index: ' + idx)
    }
    const cmd = {
      displayName: md.columnNames[idx],
      type: assertDefined(cType)
    }
    cmm[cnm] = cmd
    return cmm
  }
  const cmMap = md.columnIds.reduce(extendCMap, {})
  const schema = new Schema(md.columnIds, cmMap)
  return { tableName: md.tableName, schema }
}

/**
 * Given the current guess (or null) for a column type and cell value string cs
 * make a conservative guess at column type.
 * We use the order int <: real <: text, and a guess will only become more general.
 * TODO: support various date formats
 */
const guessColumnType = numREs => (cg: ?ColumnType, cs: ?string): ?ColumnType => {
  if (cg === 'text') {
    return cg // already most general case
  }
  if (cs == null || cs.length === 0) {
    return cg // empty cells don't affect current guess
  }
  if (cg === null || cg === 'integer') {
    let match = numREs.intRE.exec(cs)
    if (match !== null && match.index === 0 && match[0].length === cs.length) {
      return 'integer'
    }
  }
  if (cg !== 'text') {
    let match = numREs.realRE.exec(cs)
    if (match !== null && match.index === 0 && match[0].length === cs.length) {
      return 'real'
    }
  }
  return 'text'
}

/**
 * prepare a raw value string for db insert based on column type
 */
const badCharsRE = /\$,/g
const prepValue = (ct: ?ColumnType, vs: ?string): ?string => {
  if (vs == null || (vs.length === 0 && ct !== 'text')) {
    return null
  }
  if ((ct === 'integer') || (ct === 'real')) {
    let cs = vs.trim().replace(badCharsRE, '')
    return cs
  }
  // TODO: Will probably need to deal with charset encoding issues for SQLite
  return vs
}

/**
 * Find all matches of a RegExp in a string
 *
 * TODO: move to some common utility lib
 */
const reFindAll = (re: RegExp, str: string): Array<string> => {
  let matches = []
  let matchInfo
  while ((matchInfo = re.exec(str)) !== null) {
    matches.push(matchInfo[0])
  }
  return matches
}

/**
 * form a candidate column id by joining words
 *
 */
const MAXIDENT = 16
const mkColId = (words: Array<string>): string => {
  return words.join('').substr(0, MAXIDENT)
}

/**
 * Use descriptive strings from first (header) row of CSV to generate
 * unique column identifiers with no spaces, suitable for a database.
 *
 * Tries to use the first word of each description to generate a human-friendly
 * column name,  but falls back to simpler 'col'N if that fails.
 *
 * TODO: Place some limit on id length
 *
 * TODO: Can fail if given columns with the dastardly column name 'col<N>'
 *
 * returns: Array<string> of column ids for each column
 */
const identRE = /[a-zA-Z]\w*/g
const genColumnIds = (headerRow: Array<string>): Array<string> => {
  let columnIds: Array<string> = []
  let colIdMap = {}
  for (var i = 0; i < headerRow.length; i++) {
    let origHeader = headerRow[i]
    let matches = reFindAll(identRE, origHeader)
    var colId : string = mkColId(matches) // form candidate column id
    if ((matches.length === 0) || (colId.toLowerCase() in colIdMap)) {
      let baseColId = 'col' + i.toString()
      colId = baseColId
      // deal with pathological case of a previous column named 'col<i>'
      for (let j = 2; colId.toLowerCase() in colIdMap; j++) {
        colId = baseColId + '_' + j.toString()
      }
    }
    columnIds.push(colId)
    colIdMap[colId.toLowerCase()] = i
  }
  return columnIds
}

let uniqMap = {}

/* add a numeric _N suffix to an identifer to make it unique */
const uniquify = (src: string): string => {
  let entry = uniqMap[src]
  if (entry === undefined) {
    uniqMap[src] = 1
    return src  // no suffix needed
  }
  const ret = src + '_' + entry.toString()
  uniqMap[src] = ++entry
  return ret
}

/* map to alphanumeric */
const mapIdent = (src: string): string => {
  const ret = src.replace(/[^a-z0-9_]/gi, '_')
  return ret
}

const isAlpha = (ch: string): boolean => /^[A-Z]$/i.test(ch)

/* generate a SQL table name from pathname */
const genTableName = (pathname: string): string => {
  const extName = path.extname(pathname)
  const baseName = path.basename(pathname, extName)
  let baseIdent = mapIdent(baseName)
  if (!isAlpha(baseIdent[0])) {
    baseIdent = 't_' + baseIdent
  }
  const tableName = uniquify(baseIdent)
  return tableName
}

/* scanTypes will read a CSV file and return a Promise<FileMetadata> */
const metaScan = (pathname: string, delimiter: string): Promise<FileMetadata> => {
  return new Promise((resolve, reject) => {
    log.log('starting metascan...')
    const pathStats = fs.statSync(pathname)
    log.log('file size: ', pathStats.size)
    const msStart = process.hrtime()
    let firstRow = true
    var colTypes: Array<string>
    let rowCount = 0
    // extract table name from file path:
    const extName = path.extname(pathname)
    const extension = extName.slice(1)
    const tableName = genTableName(pathname)

    let csvOptions = { delimiter }
    const pathStream = fs.createReadStream(pathname)

    let gauge = new Gauge()

    const numREs = (delimiter === ';') ? eurNumREs : usNumREs
    const guessFunc = guessColumnType(numREs)

    gauge.show('scanning...', 0)
    let bytesRead = 0
    const countStream = through(function write (buf) {
      bytesRead += buf.length
      const pctComplete = bytesRead / pathStats.size
      const msg = 'scanning... ( ' + Math.round(pctComplete * 100) + '%)'
      gauge.show(msg, pctComplete)
      this.emit('data', buf)
    }, function end () {
      gauge.hide()
      log.log('countStream: bytesRead: ', bytesRead)
      this.emit('end')
    })

    let columnNames
    let columnIds

    const csvStream =
      csv(csvOptions)
      .on('data', row => {
        if (firstRow) {
          columnNames = row
          columnIds = genColumnIds(columnNames)
          colTypes = Array(columnIds.length).fill(null)
          firstRow = false
        } else {
          colTypes = _.zipWith(colTypes, row, guessFunc)
          rowCount++
        }
      })
      .on('end', () => {
        // default any remaining null column types to text:
        const columnTypes = colTypes.map(ct => (ct == null) ? 'text' : ct)
        const [es, ens] = process.hrtime(msStart)
        log.info('metascan completed in %ds %dms', es, ens / 1e6)
        resolve({columnIds, columnNames, columnTypes, rowCount, tableName, csvOptions})
      })

    pathStream.pipe(countStream).pipe(csvStream)
  })
}

// maximum number of items outstanding before pause and commit:
// Some studies of sqlite found this number about optimal
const BATCHSIZE = 10000

/*
 * consume a stream, sending all records to the Promise-returning write
 * function.
 *
 * returns: A Promise that resolves only when all records from readable
 * input stream have been written using wrf.
 * Promise value is number of records written
 */
const consumeStream = (s: stream.Readable,
                        wrf: (buf: any) => Promise<any>,
                        wrBatch: (isFinal: boolean) => Promise<any>,
                        totalItems: number,
                        skipFirst: boolean): Promise<number> => {
  return new Promise((resolve, reject) => {
    let firstItem = true
    let writeCount = 0
    let readCount = 0
    let inputDone = false
    let paused = false
    let gauge = new Gauge()

    gauge.show('loading data...', 0)
    const pctCount = Math.ceil(totalItems / 100)

    const onData = (row) => {
      if (firstItem) {
        firstItem = false
        if (skipFirst) {
          return
        }
      }
      readCount++
      const numOutstanding = readCount - writeCount
      if (numOutstanding >= BATCHSIZE) {
        s.pause()
        paused = true
        wrBatch(inputDone)
      }
      wrf(row)
        .then(() => {
          writeCount++
          const numOutstanding = readCount - writeCount
          // We may want to use a low water mark rather than zero here
          if (paused && (numOutstanding === 0)) {
            s.resume()
            paused = false
          }
          if ((writeCount % pctCount) === 0) {
            const pctComplete = writeCount / totalItems
            const statusMsg = 'loaded ' + writeCount + '/' + totalItems +
              ' rows ( ' + Math.round(pctComplete * 100) + '%)'
            gauge.show(statusMsg, pctComplete)
          }
          if (inputDone && numOutstanding === 0) {
            gauge.hide()
            wrBatch(inputDone)
            resolve(writeCount)
          }
        })
        .catch(err => {
          reject(err)
        })
    }
    const onEnd = () => {
      inputDone = true
      if (writeCount === readCount) {
        // may have already written all read items
        gauge.hide()
        wrBatch(inputDone)
        resolve(writeCount)
      } else {
        // log.log('consumeStream: readCount: ', readCount, ', writeCount: ', writeCount)
      }
    }

    let wr = through(onData, onEnd)
    s.pipe(wr)
  })
}

/**
 * Use metadata to create and populate sqlite table from CSV data
 *
 * returns: Promise<FileMetadata>
 */
const importData = (md: FileMetadata, pathname: string): Promise<FileMetadata> => {
  return new Promise((resolve, reject) => {
    const tableName = md.tableName
    const qTableName = "'" + tableName + "'"
    const dropStmt = 'drop table if exists ' + qTableName
    const idts = _.zip(md.columnIds, md.columnTypes)
    const typedCols = idts.map(([cid, ct]) => "'" + cid + "' " + (ct ? ct : '')) // eslint-disable-line
    const schemaStr = typedCols.join(', ')
    const createStmt = 'create table ' + qTableName + ' ( ' + schemaStr + ' )'

    const qs = Array(md.columnNames.length).fill('?')
    const insertStmtStr = 'insert into ' + qTableName + ' values (' + qs.join(', ') + ')'
    const insertRow = (insertStmt) => (row) => {
      let rowVals = []
      for (let i = 0; i < row.length; i++) {
        const t = md.columnTypes[i]
        const v = row[i]
        rowVals.push(prepValue(t, v))
      }
      return insertStmt.run(rowVals)
    }

    const commitBatch = (isFinal) => {
      const retp = db.run('commit')
                    .then(() => (isFinal ? null : db.run('begin')))
      return retp
    }

    /*
     * TODO: multiple sources indicate wrapping inserts in a transaction is key to getting
     * decent bulk load performance.
     * We're currently wrapping all inserts in one huge transaction. Should probably break
     * this into more reasonable (50K rows?) chunks.
     */
    db.run(dropStmt)
      .then(() => db.run(createStmt))
      .then(() => log.log('table created'))
      .then(() => db.run('begin'))
      .then(() => db.prepare(insertStmtStr))
      .then(insertStmt => {
        return consumeStream(csv.fromPath(pathname, md.csvOptions),
                             insertRow(insertStmt), commitBatch, md.rowCount, true)
                .then(rowCount => {
                  log.log('consumeStream completed, rowCount: ', rowCount)
                  return insertStmt.finalize()
                })
      })
      .then(() => resolve(md))
      .catch(err => {
        log.error(err, err.stack)
        reject(err)
      })
  })
}

/*
 * import the specified CSV file into an in-memory sqlite table
 *
 * returns: Promise<tableName: string>
 *
 */
export const importSqlite = async (pathname: string, delimiter: string): FileMetadata => {
  const md = await metaScan(pathname, delimiter)
  log.log('metascan complete. metadata:', md)
  return importData(md, pathname, delimiter)
}

const BUFSIZE = 8192

const readSampleLines = (path: string, lcount: number): Promise<Array<string>> => {
  return new Promise((resolve, reject) => {
    const ret = []
    const fstream = fs.createReadStream(path, {encoding: 'utf8'})
    const lstream = byline(fstream)
    let linesRead = 0
    lstream.on('readable', () => {
      while (linesRead < lcount) {
        let line
        line = lstream.read()
        if (line === null) {
          resolve(ret)
          return
        } else {
          ret.push(line)
          linesRead++
        }
      }
      fstream.pause()
      resolve(ret)
    })
  })
}

/*
 * Reader header row from specified path
 */
const readHeaderRow = (path: string, delimiter: string): Promise<Array<string>> => {
  return new Promise((resolve, reject) => {
    fs.open(path, 'r', 0, (err, fd) => {
      if (err) {
        log.error('readHeaderRow: rejecting with error: ', err)
        reject(err)
        return
      }
      var buf = Buffer.alloc(BUFSIZE)
      fs.read(fd, buf, 0, BUFSIZE, null, (err, bytesRead, buf) => {
        if (err) {
          reject(err)
          return
        }
        var eolIndex = buf.indexOf('\n')
        if (eolIndex < 0) {
          const msg = "'" + path + "' - invalid CSV format, no newline found in file.\n\n" +
          'This may be due to saving a CSV file from an older version of Excel on OS/X.\n\n' +
          'Possible fix: Use mac2unix utility from dos2unix homebrew package to repair file.'
          reject(new Error(msg))
          return
        }
        var s = buf.toString('utf8', 0, eolIndex)
        csv
          .fromString(s, {headers: false, delimiter})
          .on('data', data => {
            fs.close(fd, err => {
              if (err) {
                reject(err)
                return
              }
              resolve(data)
            })
          })
      })
    })
  })
}

// async wrapper around dn.driver.import:
export const dbImport = (pathname: string, tableName: string,
                         importOpts: Object): Promise<Object> => {
  return new Promise((resolve, reject) => {
    db.driver.import(pathname, tableName, importOpts, (err, res) => {
      if (err) {
        reject(err)
        return
      }
      resolve(res)
    })
  })
}

export const fastImport = async (pathname: string): FileMetadata => {
  const importStart = process.hrtime()
  try {
    const sampleLines = await readSampleLines(pathname, 2)
    const sample = sampleLines.join('\n')
    console.log('read sample lines: ', sample)
    const sniffRes = sniffer.sniff(sample, {hasHeader: true})
    console.log('csv sniffer result: ', sniffRes)
    const delimiter = sniffRes.delimiter
    if (delimiter === ';') {
      // assume European number format, use JS import impl:
      return importSqlite(pathname, delimiter)
    } else {
      const columnNames = await readHeaderRow(pathname, delimiter)
      const columnIds = genColumnIds(columnNames)
      const tableName = genTableName(pathname)
      const importOpts = { columnIds, delimiter }
      const res = await dbImport(pathname, tableName, importOpts)
      const [es, ens] = process.hrtime(importStart)
      log.info('fastImport: import completed in %ds %dms', es, ens / 1e6)
      // log.log('import info: ', res)
      const fileMetadata = {
        columnIds: res.columnIds,
        columnNames: columnNames,
        columnTypes: res.columnTypes,
        rowCount: res.rowCount,
        tableName: res.tableName,
        csvOptions: {}
      }
      return fileMetadata
    }
  } catch (err) {
    log.error('caught error during fastImport: ', err, err.stack)
    throw err
  }
}
