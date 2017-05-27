/* @flow */

import sqlite from 'sqlite'
import { TableRep, QueryExp, Schema } from './reltab'
import type { TableInfoMap, TableInfo, ValExp, Row, AggColSpec, SubExp, ColumnMetaMap, ColumnMapInfo, ColumnExtendVal, Connection } from './reltab' // eslint-disable-line
const log = require('electron-log')

function assertDefined<A> (x: ?A): A {
  if (x == null) {
    throw new Error('unexpected null value')
  }
  return x
}

class SqliteContext {
  db: any
  tableMap: TableInfoMap
  showQueries: boolean

  constructor (db: any, options: Object) {
    this.db = db
    this.tableMap = {}
    this.showQueries = (options && options.showQueries)
  }

  registerTable (ti: TableInfo) {
    this.tableMap[ti.tableName] = ti
  }

  evalQuery (query: QueryExp, offset: number = -1, limit: number = -1): Promise<TableRep> {
    let t0 = process.hrtime()
    const schema = query.getSchema(this.tableMap)
    const sqlQuery = query.toSql(this.tableMap, offset, limit)
    let t1 = process.hrtime(t0)
    const [t1s, t1ns] = t1
    if (this.showQueries) {
      log.info('time to generate sql: %ds %dms', t1s, t1ns / 1e6)
      log.log('SqliteContext.evalQuery: evaluating:')
      log.log(sqlQuery)
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
      if (this.showQueries) {
        log.info('time to run query: %ds %dms', t3s, t3ns / 1e6)
        log.info('time to mk table rep: %ds %dms', t4s, t4ns / 1e6)
      }
      return ret
    })
  }

  rowCount (query: QueryExp): Promise<number> {
    let t0 = process.hrtime()
    const countSql = query.toCountSql(this.tableMap)
    let t1 = process.hrtime(t0)
    const [t1s, t1ns] = t1
    log.info('time to generate sql: %ds %dms', t1s, t1ns / 1e6)
    if (this.showQueries) {
      log.log('SqliteContext.evalQuery: evaluating:')
      log.log(countSql)
    }
    const t2 = process.hrtime()
    const qp = this.db.all(countSql)
    return qp.then(rows => {
      const t3 = process.hrtime(t2)
      const [t3s, t3ns] = t3
      log.info('time to run query: %ds %dms', t3s, t3ns / 1e6)
      const ret = Number.parseInt(rows[0].rowCount)
      return ret
    })
  }

  // use table_info pragma to construct a TableInfo:
  getTableInfo (tableName: string): Promise<TableInfo> {
    const tiQuery = `PRAGMA table_info(${tableName})`
    const qp = this.db.all(tiQuery)
    return qp.then(rows => {
      log.log('getTableInfo: ', rows)
      const extendCMap = (cmm: ColumnMetaMap,
            row: any, idx: number): ColumnMetaMap => {
        const cnm = row.name
        const cType = row.type.toLocaleLowerCase()
        if (cType == null) {
          log.error('mkTableInfo: No column type for "' + cnm + '", index: ' + idx)
        }
        const cmd = {
          displayName: cnm,
          type: assertDefined(cType)
        }
        cmm[cnm] = cmd
        return cmm
      }
      const cmMap = rows.reduce(extendCMap, {})
      const columnIds = rows.map(r => r.name)
      const schema = new Schema(columnIds, cmMap)
      return { tableName, schema }
    })
  }
}

const init = async (dbfile, options: Object = {}): Connection => {
  await sqlite.open(dbfile)
  const ctx = new SqliteContext(sqlite, options)
  return ctx
}

// get (singleton) connection to sqlite:
let ctxPromise: ?Promise<Connection> = null

export const getContext = (dbfile: string, options: Object = {}): Promise<Connection> => {
  if (!ctxPromise) {
    ctxPromise = init(dbfile, options)
  }
  return ctxPromise
}
