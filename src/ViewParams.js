/* @flow */

import * as Immutable from 'immutable'
import * as _ from 'lodash'
import PathTree from './PathTree'
import type {Path} from './PathTree'  // eslint-disable-line
import type {QueryExp} from './dialects/base'  // eslint-disable-line
import * as baseDialect from './dialects/base' // eslint-disable-line
import type { FormatOption } from './dialects/base/FormatOptions'

const shell = require('electron').shell

// install this globally so we can access in generated a tag:
window.tadOpenExternal = (url: string) => {
  console.log('tadOpenExternal: ', url)
  shell.openExternal(url)
  return false
}

/**
 * Immutable representation of user-configurable view parameters
 *
 */

type AggMap = {[cid: string]: string}

// type FormatsMap = {[cid: string]: any}
type FormatsMap = Immutable.Map<string, FormatOption>

export default class ViewParams extends Immutable.Record({
  showRoot: false,
  displayFields: [],
  vpivots: [],
  pivotLeafFieldId: null,
  sortKey: [],
  openPaths: PathTree,
  aggMap: {}, // overrides of agg fns
  defaultFormats: new Immutable.Map(),
  columnFormats: new Immutable.Map(),
  showHiddenCols: false,
  condition: undefined,
  dialect: undefined
}) {
  showRoot: boolean
  displayFields: Array<baseDialect.Field> // array of column ids to display, in order
  vpivots: Array<baseDialect.Field>  // array of columns to pivot
  pivotLeafFieldId: ?string
  sortKey: Array<[baseDialect.Field, boolean]>
  openPaths: PathTree
  aggMap: AggMap
  defaultFormats: Immutable.Map<string, FormatOption>
  columnFormats: FormatsMap
  showHiddenCols: boolean
  condition: baseDialect.Condition
  dialect: baseDialect.Dialect

  toJS () {
    // $FlowFixMe
    const callToJs = t => t.toJS()

    // Ensure all arrays get toJS'd
    // TODO: Convert vpivots, displayFields, sortKey to Immutable.Lists so we don't have to do this
    return {
      ...super.toJS(),
      vpivots: this.vpivots.map(callToJs),
      displayFields: this.displayFields.map(callToJs),
      sortKey: this.sortKey.map(callToJs)
    }
  }

  toJSON () {
    return this.toJS()
  }

  // toggle element membership in array:
  toggleArrElem (propName: string, field: baseDialect.Field): ViewParams {
    const arr = this.get(propName)
    const idx = arr.findIndex(f => f.id === field.id)
    let nextArr
    if (idx === -1) {
      // not shown, so add it:
      nextArr = arr.concat([field])
    } else {
      // otherwise remove it:
      nextArr = arr.slice()
      nextArr.splice(idx, 1)
    }
    // Strictly enforce only one column with a given selectableName being selected.
    return this.set(propName, _.uniqBy(nextArr, f => f.selectableName))
  }

  toggleShown (field: baseDialect.Field): ViewParams {
    return this.toggleArrElem('displayFields', field)
  }

  togglePivot (field: baseDialect.Field): ViewParams {
    const oldPivots = this.vpivots
    return this.toggleArrElem('vpivots', field).trimOpenPaths(oldPivots)
  }

  setVPivots (newPivots: Array<baseDialect.Field>): ViewParams {
    const oldPivots = this.vpivots
    return this.set('vpivots', newPivots).trimOpenPaths(oldPivots)
  }

  /*
   * after updating vpivots, trim openPaths
   */
  trimOpenPaths (oldPivots: Array<baseDialect.Field>): ViewParams {
    console.log(oldPivots)
    const matchDepth = _.findIndex(_.zip(this.vpivots, oldPivots), ([p1, p2]) => ((p1 && p1.id) !== (p2 && p2.id)))
    return this.set('openPaths', this.openPaths.trimToDepth(matchDepth))
  }

  toggleSort (field: baseDialect.Field): ViewParams {
    const arr = this.get('sortKey')
    const idx = arr.findIndex(entry => entry[0].id === field.id)
    let nextArr
    if (idx === -1) {
      // not shown, so add it:
      nextArr = arr.concat([[field, true]])
    } else {
      // otherwise remove it:
      nextArr = arr.slice()
      nextArr.splice(idx, 1)
    }
    return this.set('sortKey', nextArr)
  }

  setSortDir (field: (baseDialect.Field), asc: boolean): ViewParams {
    const arr = this.get('sortKey')
    const idx = arr.findIndex(entry => entry[0].id === field.id)
    let nextArr
    if (idx === -1) {
      console.warn('viewParam.setSortDir: called for non-sort col ', field.displayName)
    } else {
      // otherwise remove it:
      nextArr = arr.slice()
      nextArr[idx] = [field, asc]
    }
    return this.set('sortKey', nextArr)
  }

  openPath (path: Path): ViewParams {
    return this.set('openPaths', this.openPaths.open(path))
  }

  closePath (path: Path): ViewParams {
    return this.set('openPaths', this.openPaths.close(path))
  }

  setAggFn (field: baseDialect.Field, agg: string) {
    const nextAggMap = {}
    Object.assign(nextAggMap, this.aggMap)
    nextAggMap[field.id] = agg
    return this.set('aggMap', nextAggMap)
  }

  // Must get aggFn from agg map because fields don't retain their functions after anything
  // that puts them in a subquery.
  getAggFn (field: baseDialect.Field) {
    return this.aggMap[field.id] || field.aggFn()
  }

  getColumnFormat (f: baseDialect.Field): any {
    let formatOpts = this.columnFormats.get(f.id)
    if (formatOpts == null) {
      formatOpts = this.defaultFormats.get(f.typeDisplayName) || f.getDefaultFormatOptions()
    }

    if (formatOpts == null) {
      throw new Error(`No default formatter for ${f}`)
    }

    return formatOpts
  }

  setColumnFormat (field: baseDialect.Field, opts: any) {
    const nextFmts = this.columnFormats.set(field, opts)
    return this.set('columnFormats', nextFmts)
  }

  constructor (params: Object) {
    params.condition = params.condition || new params.dialect.Condition()
    params.defaultFormats = Immutable.Map(params.defaultFormats)
    super(params)
  }

  static deserialize (js) {
    const { defaultFormats, openPaths, condition,
            columnFormats, dialect, displayFields, vpivots, sortKey, ...rest } = js
    const defaultFormatsObj = dialect.deserializeFormats(defaultFormats)
    const openPathsObj = new PathTree(openPaths._rep)
    let conditionObj
    if (condition) {
      conditionObj = dialect.Condition.deserialize(condition)
    }

    const deserColumnFormats = dialect.deserializeFormats(columnFormats)

    const reviveFields = f => dialect.queryReviver('', f)

    // drop column formats that we couldn't deserialize;
    // prevents us from falling over on older, malformed
    // saved per-column format options.
    const deserColumnFormatsNN = _.pickBy(deserColumnFormats)
    let columnFormatsMap = new Immutable.Map(deserColumnFormatsNN)
    const baseVP = new ViewParams({ ...rest, dialect })
    const retVP =
      baseVP
        .set('defaultFormats', new Immutable.Map(defaultFormatsObj))
        .set('openPaths', openPathsObj)
        .set('condition', conditionObj)
        .set('columnFormats', columnFormatsMap)
        .set('displayFields', displayFields.map(reviveFields))
        .set('vpivots', vpivots.map(reviveFields))
        .set('sortKey', sortKey.map(reviveFields))
    return retVP
  }
}
