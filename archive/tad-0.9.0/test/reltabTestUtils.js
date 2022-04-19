/* @flow */

import * as reltab from '../src/reltab' // eslint-disable-line
import db from 'sqlite'
import test from 'tape'

export const columnSum = (tableData: reltab.TableRep, columnId: string): number => {
  var sum: number = 0

  for (var i = 0; i < tableData.rowData.length; i++) {
    sum += ((tableData.rowData[i][columnId] : any): number)
  }
  return sum
}

type Handler = (err: any) => void

export const mkAsyncErrHandler = (t: any, msg: string): Handler => {
  return (err) => {
    console.error('caught async promise exception: ', err.stack)
    t.fail(msg + ': ' + err)
  }
}

type LogTableOptions = { maxRows?: number }

export const logTable = (table: reltab.TableRep, options: ?LogTableOptions = null): void => {
  // Node's console-table package has slightly different synopsis
  // than browser version; accepts column names as first arg:
  const ctf : any = console.table

  const rowData = (options && options.maxRows) ? table.rowData.slice(0, options.maxRows) : table.rowData

  ctf(table.schema.columns, rowData)
}

export const runSqliteTest = (label: string, f: (t: any) => Promise<any>): void => {
  test(label, t => {
    db.open(':memory:')
      .then(() => f(t))
      .then(() => db.close())
      .catch(err => console.error('error in runSqlite promise chain: ', err, err.stack))
  })
}
