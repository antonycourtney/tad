/* @flow */
import csv from 'fast-csv'
import * as _ from 'lodash'
import * as path from 'path'
import * as stream from 'stream'
import through from 'through'

// column types, for now...
// TODO: date, time, datetime, URL, ...
type ColumnType = 'integer' | 'real' | 'text'

/*
 * FileMetaData is an array of unique column IDs, column display names and
 * ColumnType for each column in a CSV file.
 * The possible null for ColumnType deals with an empty file (no rows)
 */
type FileMetadata = {
  columnIds: Array<string>,
  columnNames: Array<string>,
  columnTypes: Array<?ColumnType>,
  rowCount: number,
  tableName: string
}

/*
 * regex to match a float or int:
 * allows commas and leading $
 */
const intRE = /[-+]?[$]?[0-9,]+/
const realRE = /[-+]?[$]?[0-9,]*\.?[0-9]+([eE][-+]?[0-9]+)?/

/**
 * Given the current guess (or null) for a column type and cell value string cs
 * make a conservative guess at column type.
 * We use the order int <: real <: text, and a guess will only become more general.
 * TODO: support various date formats
 */
const guessColumnType = (cg: ?ColumnType, cs: ?string): ?ColumnType => {
  if (cg === 'text') {
    return cg // already most general case
  }
  if (cs == null || cs.length === 0) {
    return cg // empty cells don't affect current guess
  }
  if (cg === null || cg === 'integer') {
    let match = intRE.exec(cs)
    if (match !== null && match.index === 0 && match[0].length === cs.length) {
      return 'integer'
    }
  }
  if (cg !== 'text') {
    let match = realRE.exec(cs)
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
 * TODO: Would probably be better to just remove spaces and combine words
 * instead of just using first word
 * TODO: Place some limit on id length
 *
 * TODO: Can fail if given columns with the dastardly column name 'col<N>'
 *
 * returns: Array of [columnId, origHeader] for each column, where
 * origHeader is the original column header string
 */
const identRE = /[a-zA-Z]\w*/g
const genColumnIds = (headerRow: Array<string>): Array<[string, string]> => {
  let colInfo: Array<[string, string]> = []
  let colIdMap = {}
  for (var i = 0; i < headerRow.length; i++) {
    let origHeader = headerRow[i]
    let matches = reFindAll(identRE, origHeader)
    var colId : string = mkColId(matches) // form candidate column id
    if ((matches.length === 0) || (colId in colIdMap)) {
      let baseColId = 'col' + i.toString()
      colId = baseColId
      // deal with pathological case of a previous column named 'col<i>'
      for (let j = 2; colId in colIdMap; j++) {
        colId = baseColId + '_' + j.toString()
      }
    }
    colInfo.push([colId, origHeader])
    colIdMap[colId] = i
  }
  return colInfo
}

/* scanTypes will read a CSV file and return a Promise<FileMetadata> */
const metaScan = (pathname: string): Promise<FileMetadata> => {
  return new Promise((resolve, reject) => {
    let firstRow = true
    var colIdInfo: Array<[string, string]>
    var colTypes: Array<string>
    let rowCount = 0
    // extract table name from file path:
    const tableName = path.basename(pathname, path.extname(pathname))

    csv
      .fromPath(pathname)
      .on('data', row => {
        if (firstRow) {
          colIdInfo = genColumnIds(row)
          colTypes = Array(colIdInfo.length).fill(null)
          firstRow = false
        } else {
          colTypes = _.zipWith(colTypes, row, guessColumnType)
          rowCount++
        }
      })
      .on('end', () => {
        const columnIds = colIdInfo.map(p => p[0])
        const columnNames = colIdInfo.map(p => p[1])
        resolve({columnIds, columnNames, columnTypes: colTypes, rowCount, tableName})
      })
  })
}

/*
 * consume a stream, sending all records to the Promise-returning write
 * function.
 *
 * returns: A Promise that resolves only when all recrords from readable
 * input stream have been written using wrf.
 * Promise value is number of recrords written
 */
const consumeStream = (s: stream.Readable,
                        wrf: (buf: any) => Promise<any>,
                        skipFirst: boolean): Promise<number> => {
  return new Promise((resolve, reject) => {
    let firstItem = true
    let writeCount = 0
    let readCount = 0
    let inputDone = false

    const onData = (row) => {
      if (firstItem) {
        firstItem = false
        if (skipFirst) {
          return
        }
      }
      readCount++
      wrf(row)
        .then(() => {
          writeCount++
          if (inputDone && writeCount === readCount) {
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
        resolve(writeCount)
      } else {
        console.log('consumeStream: readCount: ', readCount, ', writeCount: ', writeCount)
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
const importData = (db: any, md: FileMetadata, pathname: string): Promise<FileMetadata> => {
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

    /*
     * TODO: multiple sources indicate wrapping inserts in a transaction is key to getting
     * decent bulk load performance.
     * We're currently wrapping all inserts in one huge transaction. Should probably break
     * this into more reasonable (50K rows?) chunks.
     */
    db.run(dropStmt)
      .then(() => db.run(createStmt))
      .then(() => console.log('table created'))
      .then(() => db.run('begin'))
      .then(() => db.prepare(insertStmtStr))
      .then(insertStmt => {
        return consumeStream(csv.fromPath(pathname),
                  (row) => {
                    let typedRow = _.zip(md.columnTypes, row)
                    let rowVals = typedRow.map(([t, v]) => prepValue(t, v))
                    return insertStmt.run(rowVals)
                  },
                  true)
                .then(rowCount => {
                  console.log('consumeStream completed, rowCount: ', rowCount)
                  return insertStmt.finalize()
                })
      })
      .then(() => db.run('commit'))
      .then(() => console.log('commit succeeded!'))
      .then(() => resolve(md))
      .catch(err => {
        console.error(err, err.stack)
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
export const importSqlite = (db: any, pathname: string): Promise<string> => {
  return metaScan(pathname).then(md => {
    console.log('metascan complete. rows to import: ', md.rowCount)
    return importData(db, md, pathname)
  })
}
