/* @flow */

import * as reltab from '../src/reltab' // eslint-disable-line
import test from 'tape'

export const columnSum = (tableData: reltab.TableRep, columnId: string): number => {
  var sum: number = 0

  var colIndex = tableData.schema.columnIndex(columnId)
  for (var i = 0; i < tableData.rowData.length; i++) {
    sum += ((tableData.rowData[i][colIndex] : any): number)
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

export const queryTest = (label: string, query: reltab.QueryExp,
                          cf: (t: any, res: reltab.TableRep) => void): void => {
  test(label, t => {
    reltab.local.evalQuery(query).then(res => cf(t, res)).fail(mkAsyncErrHandler(t, label))
  })
}

export const logTable = (table: reltab.TableRep): void => {
  // Node's console-table package has slightly different synopsis
  // than browser version; accepts column names as first arg:
  const ctf : any = console.table
  ctf(table.schema.columns, table.rowData)
}
