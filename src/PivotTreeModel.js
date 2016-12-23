/* @flow */

import * as reltab from './reltab'
import * as aggtree from './aggtree'
import SimpleDataView from './SimpleDataView'
import PathTree from './PathTree'
import type { Connection } from './reltab' // eslint-disable-line
import * as _ from 'lodash'

export default class PivotTreeModel {
  openPaths: PathTree
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
    this.openPaths = new PathTree()
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
    // TODO: this is redundant with AppState -- kill this one
    this.openPaths = this.openPaths.trimToDepth(matchDepth)
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

  setOpenPaths (openPaths: PathTree): void {
    this.openPaths = openPaths
    this.needPivot = true
  }

  pathIsOpen (path: Array<string>): boolean {
    if (!this.openPaths) {
      return false
    }
    return this.openPaths.isOpen(path)
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

    console.log('ptm.refresh: openPaths: ', this.openPaths)
    this.treeQueryPromise =
      this.vpivotPromise.then(ptree => ptree.getSortedTreeQuery(this.openPaths))

    const dvPromise = this.treeQueryPromise
      .then(treeQuery => this.rt.evalQuery(treeQuery))
      .then(tableData => this.loadDataView(tableData))
      .catch(err => console.error('PivotTreeModel: error: ', err, err.stack))

    return dvPromise
  }
}
