/* @flow */

import * as reltab from './reltab'
import * as aggtree from './aggtree'
import SimpleDataView from './SimpleDataView'
import AppState from './AppState'
import type { Connection } from './reltab' // eslint-disable-line

/**
 * Use AppState to construct a SimpleDataView for use with
 * SlickGrid from reltab.TableRep
 */
const mkDataView = (appState: AppState, tableData: reltab.TableRep): SimpleDataView => {
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

  var nPivots = appState.vpivots.length
  var rowData = []
  var parentIdStack = []
  for (var i = 0; i < tableData.rowData.length; i++) {
    // ?? shouldn't we just be constructing the rowMap once and re-use it for every row??
    var rowMap = tableData.schema.rowMapFromRow(tableData.rowData[ i ])
    var path = getPath(rowMap, nPivots)
    var depth = rowMap._depth
    rowMap._isOpen = appState.openPaths.isOpen(path)
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
 * Use the current AppState to construct a QueryExp to send to
 * reltab using aggtree.
 * Map the resulting TableRep from the query into a SimpleDataView for
 * use with SlickGrid
 */
export const requestView = async (rt: Connection, appState: AppState): Promise<SimpleDataView> => {
  const ptree = await aggtree.vpivot(rt, appState.baseQuery, appState.vpivots,
      appState.pivotLeafColumn, appState.showRoot, appState.sortKey)
  const treeQuery = await ptree.getSortedTreeQuery(appState.openPaths)
  const tableData = await rt.evalQuery(treeQuery)
  const dataView = mkDataView(appState, tableData)
  return dataView
}
