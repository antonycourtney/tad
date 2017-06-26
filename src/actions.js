/* @flow */

import ViewParams from './ViewParams'
import ViewState from './ViewState'
import AppState from './AppState'
import * as baseDialect from './dialects/base'
import * as constants from './components/constants'
import { List } from 'immutable'
import PathTree from './PathTree'
import type {Path} from './PathTree'  // eslint-disable-line
import * as aggtree from './aggtree'

const _ = require('lodash')

type RefUpdater = (f: ((s: AppState) => AppState)) => void

// called after main process initialization completes:
export const initAppState = (dialect: baseDialect.Dialect,
    rtc: baseDialect.Connection,
    windowTitle: string,
    baseQuery: baseDialect.QueryExp,
    initialViewParams: ?ViewParams,
    updater: RefUpdater): Promise<void> => {
  const baseSchema = aggtree.getBaseSchema(dialect, rtc, baseQuery)
  // start off with all columns displayed:
  const displayFields = _.uniqBy(baseSchema.fields.slice(), f => f.selectableName)

  let viewParams
  if (initialViewParams != null) {
    viewParams = initialViewParams
  } else {
    const openPaths = new PathTree()
    viewParams = new ViewParams({dialect, displayFields, openPaths})
  }
  const viewState = new ViewState({viewParams})
  // We explicitly set rather than merge() because merge
  // will attempt to deep convert JS objects to Immutables
  return updater(st =>
    st.set('windowTitle', windowTitle)
      .set('rtc', rtc)
      .set('baseSchema', baseSchema)
      // Delete all duplicate selectable fields. Queries with duplicated fields aren't valid
      // The reason baseQuery can have duplicated fields is because in OpsLab multiple joined tables can have
      // the same selectable field names. We still need those in the query for when we getBaseSchema, but after
      // that, they should be nuked from further querying.
      .set('baseQuery', baseQuery.set('fields', List(displayFields)))
      .set('viewState', viewState)
      .set('initialized', true)
      .set('dialect', dialect)
  )
}

// helper to hoist a ViewParams => ViewParams fn to an AppState => AppState
// Always resets the viewport
const vpUpdate = (f: ((vp: ViewParams) => ViewParams)) =>
  (s: AppState) => (s
    .updateIn(['viewState', 'viewParams'], f))

export const toggleShown = (field: baseDialect.Field, updater: RefUpdater): void => {
  updater(vpUpdate(viewParams => viewParams.toggleShown(field)))
}

export const toggleAllShown = (updater: RefUpdater): void => {
  updater(s => {
    const schema = s.baseSchema
    const viewParams = s.viewState.viewParams
    const allShown = schema.fields.length === viewParams.displayFields.length
    const nextDisplayFields = allShown ? [] : _.uniqBy(schema.fields, f => f.selectableName)

    return vpUpdate(viewParams => viewParams.set('displayFields', nextDisplayFields))(s)
  })
}

export const togglePivot = (field: baseDialect.Field, updater: RefUpdater): void => {
  updater(vpUpdate(viewParams => viewParams.togglePivot(field)))
}

export const toggleSort = (field: baseDialect.Field, updater: RefUpdater): void => {
  updater(vpUpdate(viewParams => viewParams.toggleSort(field)))
}

export const setSortDir = (field: baseDialect.Field, asc: boolean, updater: RefUpdater): void => {
  updater(vpUpdate(viewParams => viewParams.setSortDir(field, asc)))
}

export const toggleShowRoot = (updater: RefUpdater): void => {
  updater(vpUpdate(viewParams => viewParams.set('showRoot', !(viewParams.showRoot))))
}

export const reorderColumnList = (dstProps: any, srcProps: any) => {
  console.log('reorderColumnList: ', dstProps, srcProps)
  if (dstProps.columnListType !== srcProps.columnListType) {
    console.log('mismatched column list types, ignoring...')
    return
  }
  const fieldKey = dstProps.columnListType
  const isSortKey = (fieldKey === constants.ColumnListType.SORT)
  dstProps.stateRefUpdater(vpUpdate(viewParams => {
    let colList = viewParams.get(fieldKey).slice()
    if (isSortKey) {
      const srcSortKey = srcProps.rowData
      const srcIndex = colList.findIndex(k => (k[0].id === srcSortKey[0].id))
      if (srcIndex === -1) {
        return viewParams
      }
      // remove source from its current position:
      colList.splice(srcIndex, 1)
      const dstSortKey = dstProps.rowData
      const dstIndex = colList.findIndex(k => (k[0].id === dstSortKey[0].id))
      if (dstIndex === -1) {
        return viewParams
      }
      colList.splice(dstIndex, 0, srcSortKey)
      return viewParams.set(fieldKey, colList)
    } else {
      const srcColumnId = srcProps.rowData.id
      const srcIndex = colList.findIndex(f => f.id === srcColumnId)
      if (srcIndex === -1) {
        return viewParams
      }
      // remove source from its current position:
      colList.splice(srcIndex, 1)
      const dstColumnId = dstProps.rowData.id
      const dstIndex = colList.findIndex(f => f.id === dstColumnId)
      if (dstIndex === -1) {
        return viewParams
      }
      colList.splice(dstIndex, 0, srcProps.rowData)
      if (fieldKey === 'vpivots') { // evil hack
        return viewParams.setVPivots(colList)
      } else {
        return viewParams.set(fieldKey, colList)
      }
    }
  }))
}

/*
 * single column version of setting sort key
 * (until we implement compound sort keys)
 */
export const setSortKey = (sortKey: Array<[baseDialect.Field, boolean]>, updater: RefUpdater) => {
  console.log('setSortKey: ', sortKey)
  updater(vpUpdate(viewParams => viewParams.set('sortKey', sortKey)))
}

export const setColumnOrder = (displayFields: Array<baseDialect.Field>, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.set('displayFields', displayFields)))
}

export const openPath = (path: Path, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.openPath(path)))
}

export const closePath = (path: Path, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.closePath(path)))
}

export const setAggFn = (field: baseDialect.Field, aggFn: string, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.setAggFn(field, aggFn)))
}

export const updateViewport = (top: number, bottom: number, updater: RefUpdater) => {
  updater(st => st.update('viewState', vs => vs
    .set('viewportTop', top)
    .set('viewportBottom', bottom)))
}

export const setDefaultFormatOptions = (colType: string, opts: any, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.setIn(['defaultFormats', colType], opts)))
}

export const setColumnFormatOptions = (field: baseDialect.Field, opts: any, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.setColumnFormat(field, opts)))
}

export const setShowHiddenCols = (show: boolean, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.set('showHiddenCols', show)))
}

export const setCondition = (cond: baseDialect.Condition, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.set('condition', cond)))
}

export const ensureDistinctColVals = (colId: string, updater: RefUpdater) => {
  updater(appState => {
    const updSet = appState.requestedColumnVals.add(colId)
    return appState.set('requestedColumnVals', updSet)
  })
}
