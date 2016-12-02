/* @flow */

import * as Immutable from 'immutable'
import * as reltab from './reltab'

/**
 * Immutable representation of application state for use with OneRef
 *
 */
export default class AppState extends Immutable.Record({
  windowTitle: '',
  rtc: null,
  baseQuery: null,
  baseSchema: null,
  showRoot: false,
  displayColumns: [],
  vpivots: [],
  sortKey: []
}) {
  // duplicated here to allow us to write flow types:
  windowTitle: string     // Usually just the table name or file name
  rtc : reltab.Connection
  baseQuery: reltab.QueryExp
  baseSchema: reltab.Schema   // always in sync with baseQuery
  showRoot: boolean
  displayColumns: Array<string> // array of column ids to display, in order
  vpivots: Array<string>  // array of columns to pivot
  sortKey: Array<[string, boolean]>

  // toggle element membership in array this[propName]:
  toggleArrElem (propName: string, cid: string): AppState {
    const arr = this.get(propName)
    const idx = arr.indexOf(cid)
    let nextArr
    if (idx === -1) {
      // not shown, so add it:
      nextArr = arr.concat([cid])
    } else {
      // otherwise remove it:
      nextArr = arr.slice()
      nextArr.splice(idx, 1)
    }
    return this.set(propName, nextArr)
  }

  toggleShown (cid: string): AppState {
    return this.toggleArrElem('displayColumns', cid)
  }

  togglePivot (cid: string): AppState {
    return this.toggleArrElem('vpivots', cid)
  }

  toggleSort (cid: string): AppState {
    return this.toggleArrElem('sortKey', cid)
  }
}
