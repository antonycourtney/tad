/* @flow */

import * as reltab from './reltab'
import {  TableRep, Schema, RelExp, FilterExp, QueryExp } from './reltab'  // eslint-disable-line
import type { FileMetadata, TableInfoMap, ValExp, Row, AggColSpec, SubExp, ColumnMetaMap, ColumnMapInfo, ColumnExtendVal, Connection } from './reltab' // eslint-disable-line

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
    return qp.then(rows => {
      const t3 = process.hrtime(t2)
      const [t3s, t3ns] = t3
      const t4pre = process.hrtime()
      const ret = new TableRep(schema, rows)
      const t4 = process.hrtime(t4pre)
      const [t4s, t4ns] = t4
      console.info('time to run query: %ds %dms', t3s, t3ns / 1e6)
      console.info('time to mk table rep: %ds %dms', t4s, t4ns / 1e6)
      return ret
    })
  }

  rowCount (query: QueryExp): Promise<number> {
    let t0 = process.hrtime()
    const countSql = query.toCountSql(this.tableMap)
    let t1 = process.hrtime(t0)
    const [t1s, t1ns] = t1
    console.info('time to generate sql: %ds %dms', t1s, t1ns / 1e6)
    if (this.showQueries) {
      console.log('SqliteContext.evalQuery: evaluating:')
      console.log(countSql)
    }
    const t2 = process.hrtime()
    const qp = this.db.all(countSql)
    return qp.then(rows => {
      const t3 = process.hrtime(t2)
      const [t3s, t3ns] = t3
      console.info('time to run query: %ds %dms', t3s, t3ns / 1e6)
      console.log('result of count query: ', rows)
      const ret = Number.parseInt(rows[0].rowCount)
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
