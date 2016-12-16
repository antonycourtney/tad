/* @flow */

import * as reltab from './reltab'
import * as aggtree from './aggtree'
import SimpleDataView from './SimpleDataView'
import type { Connection } from './reltab' // eslint-disable-line
import * as _ from 'lodash'

// trim an open node map to given depth:
const trimToDepth = (nodeMap: Object, depth: number): Object => {
  if (depth === 0) {
    return {}
  }
  let ret = {}
  for (let elem in nodeMap) {
    ret[elem] = trimToDepth(nodeMap[elem], depth - 1)
  }
  return ret
}

export default class PivotTreeModel {
  openNodeMap: Object
  listeners: Array<any>
  treeQueryPromise: Promise<reltab.QueryExp>
  vpivotPromise: Promise<aggtree.VPivotTree>
  needPivot: boolean
  dataView: SimpleDataView
  rt: Connection
  baseQuery: reltab.QueryExp
  pivots: Array<string>
  pivotLeafColumn: ?string
  showRoot: boolean
  sortKey: Array<[string, boolean]>

  constructor (rt: Connection, baseQuery: reltab.QueryExp, pivots: Array<string>, pivotLeafColumn: ?string, showRoot: boolean) {
    this.openNodeMap = {}
    this.listeners = []
    this.treeQueryPromise = null
    this.vpivotPromise = null
    this.needPivot = true // pivots have been set, need to call vpivot()
    this.dataView = new SimpleDataView()
    this.rt = rt
    this.baseQuery = baseQuery
    this.pivots = pivots
    this.pivotLeafColumn = pivotLeafColumn
    this.showRoot = showRoot
    this.sortKey = []
  }

  setSortKey (sortKey: Array<[string, boolean]>): void {
    this.sortKey = sortKey
    this.needPivot = true
  }

  setPivotLeafColumn (pivotLeafColumn: ?string): void {
    this.pivotLeafColumn = pivotLeafColumn
    this.needPivot = true
  }

  setPivots (inPivots: Array<string>): void {
    const matchDepth = _.findIndex(_.zip(this.pivots, inPivots), ([p1, p2]) => (p1 !== p2))
    this.pivots = inPivots
    this.openNodeMap = trimToDepth(this.openNodeMap, matchDepth)
    this.needPivot = true
  }

  setShowRoot (showRoot: boolean): void {
    if (this.showRoot !== showRoot) {
      this.showRoot = showRoot
      this.needPivot = true
    }
  }

  getPivots (): Array<string> {
    return this.pivots
  }

  addPath (path: Array<string>) {
    if (!this.openNodeMap) {
      this.openNodeMap = {}
    }
    var nm = this.openNodeMap
    for (var i = 0; i < path.length; i++) {
      var subMap = nm[path[i]]
      if (!subMap) {
        subMap = {}
        nm[path[i]] = subMap
      }
      nm = subMap
    }
  }

  removePath (nodeMap: ?Object, path: Array<string>) {
    if (!nodeMap) {
      return
    }
    var entry = path.shift()
    if (path.length === 0) {
      delete nodeMap[ entry ]
    } else {
      var subMap = nodeMap[ entry ]
      if (subMap) {
        this.removePath(subMap, path)
      }
    }
  }

  openPath (path: Array<string>) {
    this.addPath(path)
  }

  closePath (path: Array<string>) {
    this.removePath(this.openNodeMap, path)
  }

  // TODO: Subtle sync issue here! Note that calls to pathIsOpen between
  // calling openPath and refresh() will return a value inconsisent with
  // the current state of the UI.
  pathIsOpen (path: Array<string>): boolean {
    if (!this.openNodeMap) {
      return false
    }
    var nm = this.openNodeMap
    for (var i = 0; i < path.length; i++) {
      var subMap = nm[path[i]]
      if (!subMap) {
        return false
      }
      nm = subMap
    }
    return true
  }

  loadDataView (tableData: reltab.TableRep) {
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

    var nPivots = this.pivots.length
    var rowData = []
    var parentIdStack = []
    for (var i = 0; i < tableData.rowData.length; i++) {
      var rowMap = tableData.schema.rowMapFromRow(tableData.rowData[ i ])
      var path = getPath(rowMap, nPivots)
      var depth = rowMap._depth
      rowMap._isOpen = this.pathIsOpen(path)
      rowMap._isLeaf = depth > nPivots
      rowMap._id = i
      parentIdStack[ depth ] = i
      var parentId = (depth > 0) ? parentIdStack[ depth - 1 ] : null
      rowMap._parentId = parentId
      rowData.push(rowMap)
    }

    this.dataView.setItems(rowData)

    const outSchema = tableData.schema
      .extend('_id', {type: 'integer', displayName: '_id'})
      .extend('_parentId', {type: 'integer', displayName: '_parentId'})
      .extend('_isOpen', {type: 'integer', displayName: '_isOpen'})
      .extend('_isLeaf', {type: 'integer', displayName: '_isLeaf'})

    this.dataView.schema = outSchema

    return this.dataView
  }

  /*
   * refresh the pivot tree based on current model state.
   * returns: promise<SimpleDataView> for that yields flattened, sorted tabular view of the pivot tree.
   */
  refresh () {
    /*
     * Open Design Question: Should we cancel any pending operation here??
     *
     * One way to do so would be to get our hands on the Q.defer() object and call .reject().
     * But going to be a bit of work to set up the plumbing for that and that still doesn't address how
     * we actually propagate a true cancellation through RelTab so that it can actually send a cancellation
     * if there is a remote server / thread doing the work.
     */
    if (this.needPivot) {
      this.vpivotPromise = aggtree.vpivot(this.rt, this.baseQuery, this.pivots,
          this.pivotLeafColumn, this.showRoot, this.sortKey)
      this.needPivot = false
    }

    this.treeQueryPromise =
      this.vpivotPromise.then(ptree => ptree.getSortedTreeQuery(this.openNodeMap))

    const dvPromise = this.treeQueryPromise
      .then(treeQuery => this.rt.evalQuery(treeQuery))
      .then(tableData => this.loadDataView(tableData))
      .catch(err => console.error('PivotTreeModel: error: ', err, err.stack))

    return dvPromise
  }

  // recursively get ancestor of specified row at the given depth:
  getAncestor (row: Object, depth: number): Object {
    if (depth > row._depth) {
      throw new Error('getAncestor: depth ' + depth +
        ' > row.depth of ' + row._depth + ' at row ' + row._id)
    }
    while (depth < row._depth) {
      row = this.dataView.getItemById(row._parentId)
    }
    return row
  }
}
