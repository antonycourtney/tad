/* @flow */

import * as reltab from './reltab'
import * as aggtree from './aggtree'
import SimpleDataView from './SimpleDataView'
import ViewParams from './ViewParams'
import AppState from './AppState'
import type { Connection } from './reltab' // eslint-disable-line
import * as oneref from 'oneref'  // eslint-disable-line
import * as util from './util'
import * as paging from './paging'

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
const requestView = async (rt: Connection,
    baseQuery: reltab.QueryExp,
    baseSchema: reltab.Schema,
    viewParams: ViewParams,
    offset: number,
    limit: number): Promise<SimpleDataView> => {
  const ptree = await aggtree.vpivot(rt, baseQuery, baseSchema, viewParams.vpivots,
      viewParams.pivotLeafColumn, viewParams.showRoot, viewParams.sortKey)
  const treeQuery = await ptree.getSortedTreeQuery(viewParams.openPaths)
  console.log('requestView: ', offset, limit)
  const tableData = await rt.evalQuery(treeQuery, offset, limit)
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
  pendingOffset: number
  pendingLimit: number

  constructor (stateRef: oneref.Ref<AppState>) {
    this.pendingRequest = null
    this.pendingViewParams = null
    stateRef.on('change', () => this.onStateChange(stateRef))
    console.log('PivotRequester: registered change listener')
    // And invoke onStateChange initially to get things started:
    this.onStateChange(stateRef)
  }

/*
((this.pendingRequest !== null) &&
!paging.contains(this.pendingOffset, this.pendingLimit,
  viewState.viewportTop, viewState.viewportBottom)))
*/

  onStateChange (stateRef: oneref.Ref<AppState>) {
    const appState : AppState = stateRef.getValue()
    const viewState = appState.viewState
    console.log('onStateChange: ', viewState, this.pendingViewParams)
    if (viewState.viewParams !== this.pendingViewParams) {
      // Might be nice to cancel any pending request here...
      // failing that we could calculate additional pages we need
      // if viewParams are same and only page range differs.
      const [offset, limit] =
        paging.fetchParams(viewState.viewportTop, viewState.viewportBottom)
      console.log('fetchParams: ', offset, limit)
      this.pendingViewParams = viewState.viewParams
      this.pendingOffset = offset
      this.pendingLimit = limit
      const req = requestView(appState.rtc, appState.baseQuery,
        appState.baseSchema, this.pendingViewParams, offset, limit)
      this.pendingRequest = req.then(dataView => {
        this.pendingRequest = null
        // this.pendingViewParams = null
        const appState = stateRef.getValue()
        const nextSt = appState.update('viewState', vs => {
          return (vs
            .update('loadingTimer', lt => lt.stop())
            .set('dataView', dataView))
        })
        stateRef.setValue(nextSt)
        return dataView
      })
      const ltUpdater = util.pathUpdater(stateRef, ['viewState', 'loadingTimer'])
      const nextAppState = appState.updateIn(['viewState', 'loadingTimer'],
        lt => lt.run(200, ltUpdater))
      stateRef.setValue(nextAppState)
    }
  }
}
