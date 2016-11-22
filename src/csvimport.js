/* @flow */
import csv from 'fast-csv'
import * as _ from 'lodash'
import * as sqlite3raw from 'sqlite3'
import * as path from 'path'

// TODO: turn this off!  Apparently quite costly
const sqlite3 = sqlite3raw.verbose() // long stacks for debugging

// column types, for now...
// TODO: date, time, datetime, URL, ...
type ColumnType = 'integer' | 'real' | 'text'

/*
 * FileMetaData is an array of unique column IDs, column display names and
 * ColumnType for each column in a CSV file.
 * The possible nulll for ColumnType deals with an empty file (no rows)
 */
type FileMetadata = {
columnIds: Array<string>,
columnNames: Array<string>,
columnTypes: Array<?ColumnType>,
rowCount: number
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
const prepValue = (ct: ColumnType, vs: ?string): ?string => {
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
        resolve({columnIds, columnNames, columnTypes: colTypes, rowCount})
      })
  })
}

/**
 * Use metadata to create and populate sqlite table from CSV data
 *
 * returns: Promise<string> with table name of populated sqlite table
 */
const importData = (db: any, md: FileMetadata, pathname: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // extract table name from file path and quote it:
    const tableName = path.basename(pathname, path.extname(pathname))
    const qTableName = "'" + tableName + "'"
    const dropStmt = 'drop table if exists ' + qTableName
    db.run(dropStmt)
    // *sigh* Would be better to use _zipWith here instead of zip and map,
    // but Flow type chokes if we do that
    const idts = _.zip(md.columnIds, md.columnTypes)
    const typedCols = idts.map(([cid, ct]) => "'" + cid + "' " + (ct ? ct : '')) // eslint-disable-line
    const schemaStr = typedCols.join(', ')
    const createStmt = 'create table ' + qTableName + ' ( ' + schemaStr + ' )'
    db.run(createStmt, err => {
      if (err) {
        console.error('error creating table: ', err)
        return
      }
      console.log('table created')
      /*
       * TODO: multiple sources indicate wrapping inserts in a transaction is key to getting
       * decent bulk load performance.
       * We're currently wrapping all inserts in one huge transaction. Should probably break
       * this into more reasonable (50K rows?) chunks.
       */
      db.run('begin', err => {
        if (err) {
          console.error(err)
          reject(err)
        }
      })
      const qs = Array(md.columnNames.length).fill('?')
      const insertStmtStr = 'insert into ' + qTableName + ' values (' + qs.join(', ') + ')'
      const insertStmt = db.prepare(insertStmtStr)
      let firstRow = true
      let insertCount = 0
      csv
        .fromPath(pathname)
        .on('data', row => {
          if (firstRow) {
            // header row -- skip
            firstRow = false
          } else {
            let rowVals = _.zipWith(md.columnTypes, row, prepValue)
            if (insertCount === (md.rowCount - 1)) {
              insertStmt.run(rowVals, err => {
                if (err) {
                  reject(err)
                  return
                }
                console.log('committing...')
                db.run('commit', err => {
                  if (err) {
                    reject(err)
                    return
                  }
                  console.log('commit succeeded!')
                  resolve(tableName)
                })
              })
              insertStmt.finalize()
            } else {
              insertStmt.run(rowVals, err => {
                if (err) {
                  console.error('error during row insert: ', err)
                  reject(err)
                }
              })
            }
            insertCount++
          }
        })
        .on('end', () => {
          console.log('done reading csv data')
        })
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

const testIt = () => {
  const testPath = '/Users/antony/home/src/easypivot-old/csv/bart-comp-all.csv'
  // const testPath = '/Users/antony/data/movie_metadata.csv'
  // const testPath = '/Users/antony/data/uber-pickups-in-new-york-city/uber-raw-data-apr14.csv'

  const db = new sqlite3.Database(':memory:')
  db.serialize(() => {
    importSqlite(db, testPath)
      .then(tableName => {
        console.log('table import complete: ', tableName)

        db.all("select * from '" + tableName + "' limit 10", (err, rows) => {
          if (err) {
            console.error(err)
            return
          }
          console.log(rows)
          db.close()
        })
      }, err => {
        console.error('caught exception in importSqlite: ', err, err.stack)
      })
  })
}

testIt()
