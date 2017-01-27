/* @flow */
/**
 * A reltab connection that uses electron remote to send queries from
 * the render process to the main process
 */
import * as reltab from './reltab'

export const init = (): reltab.Connection => {
  const remoteQuery = require('electron').remote.getGlobal('runQuery')
  const remoteRowCount = require('electron').remote.getGlobal('getRowCount')

  const rtc = {
    evalQuery (query: reltab.QueryExp,
        offset: number = -1, limit: number = -1): Promise<reltab.TableRep> {
      return new Promise((resolve, reject) => {
        let req : Object = { query }
        if (offset !== -1) {
          req['offset'] = offset
          req['limit'] = limit
        }
        console.log('rtc.evalQuery: ', req)
        const sq = JSON.stringify(req, null, 2)
        remoteQuery(sq, resStr => {
          const res = reltab.deserializeTableRep(resStr)
          // console.log('reltab-electron got query result: ')
          // console.log('columns: ', res.schema.columns)
          // console.table(res.rowData)
          resolve(res)
        })
      })
    },
    rowCount (query: reltab.QueryExp): Promise<number> {
      return new Promise((resolve, reject) => {
        let req : Object = { query }
        const sq = JSON.stringify(req, null, 2)
        remoteRowCount(sq, resStr => {
          const res = JSON.parse(resStr)
          console.log('reltab-electron got row count result: ', res)
          // console.log('columns: ', res.schema.columns)
          // console.table(res.rowData)
          resolve(res.rowCount)
        })
      })
    }
  }
  return rtc
}
