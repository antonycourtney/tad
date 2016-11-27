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

  constructor (db: any, tableMap: TableInfoMap) {
    this.db = db
    this.tableMap = tableMap
  }

  evalQuery (query: QueryExp): Promise<TableRep> {
    const schema = query.getSchema(this.tableMap)
    const sqlQuery = query.toSql(this.tableMap)
    console.log('SqliteContext.evalQuery: evaluating:')
    console.log(sqlQuery)
    const qp = this.db.all(sqlQuery)
    return qp.then(rows => mkTableRep(schema, rows))
  }
}

export const init = (db: any, md: FileMetadata): Promise<Connection> => {
  return new Promise((resolve, reject) => {
    let tm = {}
    tm[md.tableName] = reltab.mkTableInfo(md)
    const ctx = new SqliteContext(db, tm)
    global.rtc = ctx
    resolve(ctx)
  })
}
