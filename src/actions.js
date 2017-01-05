/* @flow */

import ViewParams from './ViewParams'
import ViewState from './ViewState'
import AppState from './AppState'
import * as reltab from './reltab'
import * as constants from './components/constants'
import PathTree from './PathTree'
import type {Path} from './PathTree'  // eslint-disable-line
import * as aggtree from './aggtree'

export const createAppState = (rtc: reltab.Connection,
    title: string, baseQuery: reltab.QueryExp): Promise<AppState> => {
  return aggtree.getBaseSchema(rtc, baseQuery)
    .then(baseSchema => {
      // start off with all columns displayed:
      const displayColumns = baseSchema.columns.slice()
      const openPaths = new PathTree()
      const viewParams = new ViewParams({displayColumns, openPaths})
      const viewState = new ViewState({viewParams})

      return new AppState({title, rtc, baseSchema, baseQuery, viewState})
    })
}

type RefUpdater = (f: ((s: AppState) => AppState)) => void

// helper to hoist a ViewParams => ViewParams fn to an AppState => AppState
const vpUpdate = (f: ((vp: ViewParams) => ViewParams)) =>
  (s: AppState) => s.updateIn(['viewState', 'viewParams'], f)

export const toggleShown = (cid: string, updater: RefUpdater): void => {
  updater(vpUpdate(viewParams => viewParams.toggleShown(cid)))
}

export const togglePivot = (cid: string, updater: RefUpdater): void => {
  updater(vpUpdate(viewParams => viewParams.togglePivot(cid)))
}

export const toggleSort = (cid: string, updater: RefUpdater): void => {
  updater(vpUpdate(viewParams => viewParams.toggleSort(cid)))
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
  // TODO: fix to deal with sort key column list:
  if (dstProps.columnListType === constants.ColumnListType.SORT) {
    console.error('drag and drop of sort key not supported')
    return
  }
  const fieldKey = dstProps.columnListType
  dstProps.stateRefUpdater(vpUpdate(viewParams => {
    let colList = viewParams.get(fieldKey).slice()
    // TODO: FIX when we add sort key support:
    const srcColumnId = srcProps.rowData
    const srcIndex = colList.indexOf(srcColumnId)
    if (srcIndex === -1) {
      return viewParams
    }
    // remove source from its current position:
    colList.splice(srcIndex, 1)
    const dstColumnId = dstProps.rowData
    const dstIndex = colList.indexOf(dstColumnId)
    if (dstIndex === -1) {
      return viewParams
    }
    colList.splice(dstIndex, 0, srcColumnId)
    return viewParams.set(fieldKey, colList)
  }))
}

/*
 * single column version of setting sort key
 * (until we implement compound sort keys)
 */
export const setSortKey = (sortKey: Array<[string, boolean]>, updater: RefUpdater) => {
  console.log('setSortKey: ', sortKey)
  updater(vpUpdate(viewParams => viewParams.set('sortKey', sortKey)))
}

export const setColumnOrder = (displayColumns: Array<string>, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.set('displayColumns', displayColumns)))
}

export const openPath = (path: Path, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.openPath(path)))
}

export const closePath = (path: Path, updater: RefUpdater) => {
  updater(vpUpdate(viewParams => viewParams.closePath(path)))
}

export const updateViewport = (top: number, bottom: number, updater: RefUpdater) => {
  updater(st => st.update('viewState', vs => vs
    .set('viewportTop', top)
    .set('viewportBottom', bottom)))
}
