/* @flow */
/**
 * A reltab connection that uses electron remote to send queries from
 * the render process to the main process
 */
import * as reltab from './reltab'

const remoteQuery = require('electron').remote.getGlobal('runQuery')

const rtc = {
  evalQuery (query: reltab.QueryExp): Promise<reltab.TableRep> {
    return new Promise((resolve, reject) => {
      const sq = JSON.stringify(query, null, 2)
      remoteQuery(sq, resStr => {
        const res = reltab.deserializeTableRep(resStr)
        console.log('reltab-electron got query result: ')
        console.log('columns: ', res.schema.columns)
        console.table(res.rowData)
        resolve(res)
      })
    })
  }
}

module.exports = rtc
