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

// type FormatsMap = {[cid: string]: any}
type FormatOptions = TextFormatOptions | NumFormatOptions
type FormatsMap = Immutable.Map<string, FormatOptions>

// deserialize a formatter by examining its type member:
const deserializeFormatOptions = (jsObj: Object): ?FormatOptions => {
  let ret
  if (jsObj.type === 'TextFormatOptions') {
    ret = new TextFormatOptions(jsObj)
  } else if (jsObj.type === 'NumFormatOptions') {
    ret = new NumFormatOptions(jsObj)
  } else {
    console.error('could not deserialize FormatOptions: ', jsObj)
    ret = null
  }
  return ret
}

// formatting defaults, keyed by column type:
class FormatDefaults extends Immutable.Record({
  'text': new TextFormatOptions(),
  'integer': new NumFormatOptions({decimalPlaces: 0}),
  'real': new NumFormatOptions(),
  'boolean': new NumFormatOptions({decimalPlaces: 0})  // for now...
}) {
  static deserialize (jsObj) {
    const initMap = {
      'text': new TextFormatOptions(jsObj['text']),
      'integer': new NumFormatOptions(jsObj['integer']),
      'real': new NumFormatOptions(jsObj['real']),
      'boolean': new NumFormatOptions(jsObj['boolean'])
    }
    return new FormatDefaults(initMap)
  }
}

export default class ViewParams extends Immutable.Record({
  showRoot: false,
  displayColumns: [],
  vpivots: [],
  pivotLeafColumn: null,
  sortKey: [],
  openPaths: PathTree,
  aggMap: {}, // overrides of agg fns
  defaultFormats: new FormatDefaults(),
  columnFormats: new Immutable.Map(),
  showHiddenCols: false,
  filterExp: new reltab.FilterExp()
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
  showHiddenCols: boolean
  filterExp: reltab.FilterExp

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

  setVPivots (newPivots: Array<string>): ViewParams {
    const oldPivots = this.vpivots
    return this.set('vpivots', newPivots).trimOpenPaths(oldPivots)
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
    let formatOpts = this.columnFormats.get(cid)
    if (formatOpts == null) {
      formatOpts = this.defaultFormats[schema.columnType(cid)]
    }
    return formatOpts
  }

  setColumnFormat (cid: string, opts: any) {
    const nextFmts = this.columnFormats.set(cid, opts)
    return this.set('columnFormats', nextFmts)
  }

  static deserialize (js) {
    const { defaultFormats, openPaths, filterExp,
            columnFormats, ...rest } = js
    const defaultFormatsObj = FormatDefaults.deserialize(defaultFormats)
    const openPathsObj = new PathTree(openPaths._rep)
    let filterExpObj
    if (filterExp) {
      filterExpObj = reltab.FilterExp.deserialize(filterExp)
    } else {
      filterExpObj = new reltab.FilterExp()
    }
    const deserColumnFormats = _.mapValues(columnFormats,
        deserializeFormatOptions)
    // drop column formats that we couldn't deserialize;
    // prevents us from falling over on older, malformed
    // saved per-column format options.
    const deserColumnFormatsNN = _.pickBy(deserColumnFormats)
    let columnFormatsMap = new Immutable.Map(deserColumnFormatsNN)
    const baseVP = new ViewParams(rest)
    const retVP =
      baseVP
        .set('defaultFormats', defaultFormatsObj)
        .set('openPaths', openPathsObj)
        .set('filterExp', filterExpObj)
        .set('columnFormats', columnFormatsMap)
    return retVP
  }
}
