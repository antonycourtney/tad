/* @flow */

import * as Immutable from 'immutable'
import * as reltab from './reltab'
import * as _ from 'lodash'
import PathTree from './PathTree'
import type {Path} from './PathTree'  // eslint-disable-line
import type {QueryExp} from './reltab'  // eslint-disable-line

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
  pivotLeafColumn: null,
  sortKey: [],
  openPaths: PathTree
}) {
  // duplicated here to allow us to write flow types:
  windowTitle: string     // Usually just the table name or file name
  rtc : reltab.Connection
  baseQuery: reltab.QueryExp
  baseSchema: reltab.Schema   // always in sync with baseQuery
  showRoot: boolean
  displayColumns: Array<string> // array of column ids to display, in order
  vpivots: Array<string>  // array of columns to pivot
  pivotLeafColumn: ?string
  sortKey: Array<[string, boolean]>
  openPaths: PathTree

  // toggle element membership in array:
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
    const oldPivots = this.vpivots
    return this.toggleArrElem('vpivots', cid).trimOpenPaths(oldPivots)
  }

  /*
   * after updating vpivots, trim openPaths
   */
  trimOpenPaths (oldPivots: Array<string>): AppState {
    const matchDepth = _.findIndex(_.zip(this.pivots, oldPivots), ([p1, p2]) => (p1 !== p2))
    return this.set('openPaths', this.openPaths.trimToDepth(matchDepth))
  }

  toggleSort (cid: string): AppState {
    const arr = this.get('sortKey')
    const idx = arr.findIndex(entry => entry[0] === cid)
    let nextArr
    if (idx === -1) {
      // not shown, so add it:
      nextArr = arr.concat([[cid, true]])
    } else {
      // otherwise remove it:
      nextArr = arr.slice()
      nextArr.splice(idx, 1)
    }
    return this.set('sortKey', nextArr)
  }

  openPath (path: Path): AppState {
    return this.set('openPaths', this.openPaths.open(path))
  }

  closePath (path: Path): AppState {
    return this.set('openPaths', this.openPaths.close(path))
  }
}
