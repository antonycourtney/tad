/* @flow */

import * as Immutable from 'immutable'
import * as _ from 'lodash'
import PathTree from './PathTree'
import type {Path} from './PathTree'  // eslint-disable-line
import type {QueryExp} from './reltab'  // eslint-disable-line
import * as reltab from './reltab' // eslint-disable-line
import TextFormatOptions from './TextFormatOptions'
import NumFormatOptions from './NumFormatOptions'

/**
 * Immutable representation of user-configurable view parameters
 *
 */

type AggMap = {[cid: string]: reltab.AggFn}

type FormatsMap = {[cid: string]: any}

// formatting defaults, keyed by column type:
const FormatDefaults = Immutable.Record({
  'text': new TextFormatOptions(),
  'integer': new NumFormatOptions({decimalPlaces: 0}),
  'real': new NumFormatOptions(),
  'boolean': new NumFormatOptions({decimalPlaces: 0})  // for now...
})

export default class ViewParams extends Immutable.Record({
  showRoot: false,
  displayColumns: [],
  vpivots: [],
  pivotLeafColumn: null,
  sortKey: [],
  openPaths: PathTree,
  aggMap: {}, // overrides of agg fns
  defaultFormats: new FormatDefaults(),
  columnFormats: {}
}) {
  showRoot: boolean
  displayColumns: Array<string> // array of column ids to display, in order
  vpivots: Array<string>  // array of columns to pivot
  pivotLeafColumn: ?string
  sortKey: Array<[string, boolean]>
  openPaths: PathTree
  aggMap: AggMap
  defaultFormats: {
    'text': TextFormatOptions,
    'integer': NumFormatOptions,
    'real': NumFormatOptions,
    'boolean': NumFormatOptions
  }
  columnFormats: FormatsMap

  // toggle element membership in array:
  toggleArrElem (propName: string, cid: string): ViewParams {
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

  toggleShown (cid: string): ViewParams {
    return this.toggleArrElem('displayColumns', cid)
  }

  togglePivot (cid: string): ViewParams {
    const oldPivots = this.vpivots
    return this.toggleArrElem('vpivots', cid).trimOpenPaths(oldPivots)
  }

  /*
   * after updating vpivots, trim openPaths
   */
  trimOpenPaths (oldPivots: Array<string>): ViewParams {
    const matchDepth = _.findIndex(_.zip(this.vpivots, oldPivots), ([p1, p2]) => (p1 !== p2))
    return this.set('openPaths', this.openPaths.trimToDepth(matchDepth))
  }

  toggleSort (cid: string): ViewParams {
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

  setSortDir (cid: string, asc: boolean): ViewParams {
    const arr = this.get('sortKey')
    const idx = arr.findIndex(entry => entry[0] === cid)
    let nextArr
    if (idx === -1) {
      console.warn('viewParam.setSortDir: called for non-sort col ', cid)
    } else {
      // otherwise remove it:
      nextArr = arr.slice()
      nextArr[idx] = [cid, asc]
    }
    return this.set('sortKey', nextArr)
  }

  openPath (path: Path): ViewParams {
    return this.set('openPaths', this.openPaths.open(path))
  }

  closePath (path: Path): ViewParams {
    return this.set('openPaths', this.openPaths.close(path))
  }

  getAggFn (schema: reltab.Schema, cid: string): reltab.AggFn {
    let aggFn = this.aggMap[cid]
    if (aggFn == null) {
      aggFn = reltab.defaultAggFn(schema.columnType(cid))
    }
    return aggFn
  }

  setAggFn (cid: string, cidAgg: reltab.AggFn) {
    const nextAggMap = {}
    Object.assign(nextAggMap, this.aggMap)
    nextAggMap[cid] = cidAgg
    return this.set('aggMap', nextAggMap)
  }

  getColumnFormat (schema: reltab.Schema, cid: string): any {
    let formatOpts = this.columnFormats[cid]
    if (formatOpts == null) {
      formatOpts = this.defaultFormats[schema.columnType(cid)]
    }
    return formatOpts
  }

  setColumnFormat (cid: string, opts: any) {
    const nextFmts = {}
    Object.assign(nextFmts, this.columnFormats)
    nextFmts[cid] = opts
    return this.set('columnFormats', nextFmts)
  }
}
