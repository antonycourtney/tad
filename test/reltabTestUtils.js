/* @flow */

import * as reltab from '../src/reltab' // eslint-disable-line

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
