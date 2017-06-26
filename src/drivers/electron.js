/* @flow */
/**
 * A connection that uses electron remote to send queries from
 * the render process to the main process
 */
import * as baseDialect from '../dialects/base'

export const init = (dialect: baseDialect.Dialect): baseDialect.Connection => {
  const remoteQuery = require('electron').remote.getGlobal('runQuery')
  const remoteRowCount = require('electron').remote.getGlobal('getRowCount')

  const rtc = {
    evalQuery (query: baseDialect.QueryExp,
               offset: number = -1, limit: number = -1): Promise<baseDialect.TableRep> {
      return new Promise((resolve, reject) => {
        let req : Object = { query }
        if (offset !== -1) {
          req['offset'] = offset
          req['limit'] = limit
        }
        const sq = JSON.stringify(req, null, 2)
        remoteQuery(sq, (err, resStr) => {
          if (err) {
            reject(err)
            return
          }
          const res = dialect.deserializeTableRep(resStr)
          // console.log('reltab-electron got query result: ')
          // console.log('columns: ', res.schema.columns)
          // console.table(res.rowData)
          resolve(res)
        })
      })
    },
    rowCount (query: baseDialect.QueryExp): Promise<number> {
      return new Promise((resolve, reject) => {
        let req : Object = { query }
        const sq = JSON.stringify(req, null, 2)
        remoteRowCount(sq, (err, resStr) => {
          if (err) {
            reject(err)
            return
          }
          const res = JSON.parse(resStr)
          // console.log('columns: ', res.schema.columns)
          // console.table(res.rowData)
          resolve(res.rowCount)
        })
      })
    }
  }
  return rtc
}
