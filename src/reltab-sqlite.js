/* @flow */

import * as reltab from './reltab'
import {  TableRep, Schema, RelExp, FilterExp, QueryExp } from './reltab'  // eslint-disable-line
import type { FileMetadata, TableInfoMap, ValExp, Row, AggColSpec, SubExp, ColumnMetaMap, ColumnMapInfo, ColumnExtendVal, Connection } from './reltab' // eslint-disable-line

/**
 * Map the rows of objects into TableRep array representation.
 *
 * TODO: Since Sqlite only gives us rows represented in this format and
 * SlickGrid wants the same representation, we should probably capitulate
 * and just use this format for TableRep, and add the conversion code
 * in reltab-local to conform to this styles
 */
const mkTableRep = (schema: Schema, objRows: Array<Object>): TableRep => {
  const mkArrayRow = (rowObj: Object) => schema.columns.map(cid => rowObj[cid])
  const arrayRows = objRows.map(mkArrayRow)

  return new TableRep(schema, arrayRows)
}

class SqliteContext {
  db: any
  tableMap: TableInfoMap
  showQueries: boolean

  constructor (db: any, tableMap: TableInfoMap, options: Object) {
    this.db = db
    this.tableMap = tableMap
    this.showQueries = (options && options.showQueries)
  }

  evalQuery (query: QueryExp, offset: number = -1, limit: number = -1): Promise<TableRep> {
    let t0 = process.hrtime()
    const schema = query.getSchema(this.tableMap)
    const sqlQuery = query.toSql(this.tableMap, offset, limit)
    let t1 = process.hrtime(t0)
    const [t1s, t1ns] = t1
    console.info('time to generate sql: %ds %dms', t1s, t1ns / 1e6)
    if (this.showQueries) {
      console.log('SqliteContext.evalQuery: evaluating:')
      console.log(sqlQuery)
    }
    const t2 = process.hrtime()
    const qp = this.db.all(sqlQuery)
    const t3 = process.hrtime(t2)
    const [t3s, t3ns] = t3
    const t4pre = process.hrtime()
    return qp.then(rows => {
      const ret = mkTableRep(schema, rows)
      const t4 = process.hrtime(t4pre)
      const [t4s, t4ns] = t4
      console.info('time to run query: %ds %dms', t3s, t3ns / 1e6)
      console.info('time to mk table rep: %ds %dms', t4s, t4ns / 1e6)
      return ret
    })
  }
}

export const init = (db: any, md: FileMetadata,
    options: Object = {}): Promise<Connection> => {
  return new Promise((resolve, reject) => {
    let tm = {}
    tm[md.tableName] = reltab.mkTableInfo(md)
    const ctx = new SqliteContext(db, tm, options)
    global.rtc = ctx
    resolve(ctx)
  })
}
