/* @flow */

import * as reltab from './reltab'
import * as aggtree from './aggtree'
import SimpleDataView from './SimpleDataView'
import ViewParams from './ViewParams'
import AppState from './AppState'
import type { Connection } from './reltab' // eslint-disable-line
import * as oneref from 'oneref'  // eslint-disable-line

/**
 * Use ViewParams to construct a SimpleDataView for use with
 * SlickGrid from reltab.TableRep
 */
const mkDataView = (viewParams: ViewParams, tableData: reltab.TableRep): SimpleDataView => {
  const getPath = (rowMap, depth) => {
    let path = []
    for (let i = 0; i < depth; i++) {
      let pathElem = rowMap['_path' + i]
      if (pathElem) {
        path.push(pathElem)
      }
    }
    return path
  }

  var nPivots = viewParams.vpivots.length
  var rowData = []
  var parentIdStack = []
  for (var i = 0; i < tableData.rowData.length; i++) {
    // ?? shouldn't we just be constructing the rowMap once and re-use it for every row??
    var rowMap = tableData.schema.rowMapFromRow(tableData.rowData[ i ])
    var path = getPath(rowMap, nPivots)
    var depth = rowMap._depth
    rowMap._isOpen = viewParams.openPaths.isOpen(path)
    rowMap._isLeaf = depth > nPivots
    rowMap._id = i
    parentIdStack[ depth ] = i
    var parentId = (depth > 0) ? parentIdStack[ depth - 1 ] : null
    rowMap._parentId = parentId
    rowData.push(rowMap)
  }

  const dataView = new SimpleDataView()
  dataView.setItems(rowData)

  const outSchema = tableData.schema
    .extend('_id', {type: 'integer', displayName: '_id'})
    .extend('_parentId', {type: 'integer', displayName: '_parentId'})
    .extend('_isOpen', {type: 'integer', displayName: '_isOpen'})
    .extend('_isLeaf', {type: 'integer', displayName: '_isLeaf'})

  dataView.schema = outSchema

  return dataView
}

/**
 * Use the current ViewParams to construct a QueryExp to send to
 * reltab using aggtree.
 * Map the resulting TableRep from the query into a SimpleDataView for
 * use with SlickGrid
 */
const requestView = async (rt: Connection, baseQuery: reltab.QueryExp,
    viewParams: ViewParams): Promise<SimpleDataView> => {
  const ptree = await aggtree.vpivot(rt, baseQuery, viewParams.vpivots,
      viewParams.pivotLeafColumn, viewParams.showRoot, viewParams.sortKey)
  const treeQuery = await ptree.getSortedTreeQuery(viewParams.openPaths)
  const tableData = await rt.evalQuery(treeQuery)
  const dataView = mkDataView(viewParams, tableData)
  return dataView
}

/**
 * A PivotRequester listens for changes on the appState and viewport and
 * manages issuing of query requests
 */
export default class PivotRequester {
  pendingRequest: ?Promise<SimpleDataView>
  pendingViewParams: ?ViewParams

  constructor (stateRef: oneref.Ref<AppState>) {
    this.pendingRequest = null
    this.pendingViewParams = null
    stateRef.on('change', () => this.onStateChange(stateRef))
    console.log('PivotRequester: registered change listener')
    // And invoke onStateChange initially to get things started:
    this.onStateChange(stateRef)
  }

  onStateChange (stateRef: oneref.Ref<AppState>) {
    const appState : AppState = stateRef.getValue()
    if (appState.viewState.viewParams !== this.pendingViewParams) {
      // Would be nice to cancel any pending request here...
      this.pendingViewParams = appState.viewState.viewParams
      const req = requestView(appState.rtc, appState.baseQuery,
        this.pendingViewParams)
      this.pendingRequest = req.then(dataView => {
        console.log('PivotRequester: got result, updating state:')
        const nextSt = appState.update('viewState', vs => {
          return vs.set('loading', false).set('dataView', dataView)
        })
        stateRef.setValue(nextSt)
        return dataView
      })
      const nextAppState = appState.updateIn(['viewState', 'loading'], () => true)
      stateRef.setValue(nextAppState)
    }
  }
}
