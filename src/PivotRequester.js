/* @flow */

import * as baseDialect from './dialects/base'
import * as aggtree from './aggtree'
import PagedDataView from './PagedDataView'
import ViewParams from './ViewParams'
import AppState from './AppState'
import QueryView from './QueryView'
import type { Connection } from './dialects/base' // eslint-disable-line
import * as oneref from 'oneref'  // eslint-disable-line
import * as paging from './paging'
import * as util from './util'
import log from 'electron-log'

const remoteErrorDialog = require('electron').remote.getGlobal('errorDialog')

/**
 * Use ViewParams to construct a PagedDataView for use with
 * SlickGrid from baseDialect.TableRep
 */
const mkDataView = (viewParams: ViewParams,
  rowCount: number,
  offset: number,
  tableData: baseDialect.TableRep): PagedDataView => {
  const getPath = (rowMap, depth) => {
    let path = []
    for (let i = 0; i < depth; i++) {
      let pathElemAny: any = rowMap['_path' + i]
      let pathElem: ?string = pathElemAny
      path.push(pathElem)
    }
    return path
  }

  var nPivots = viewParams.vpivots.length
  var rowData = []
  var parentIdStack = []
  for (var i = 0; i < tableData.rowData.length; i++) {
    // ?? shouldn't we just be constructing the rowMap once and re-use it for every row??
    var rowMap: Object = tableData.rowData[ i ]
    var depth: number = rowMap._depth
    var path = getPath(rowMap, depth)
    rowMap._isOpen = viewParams.openPaths.isOpen(path)
    // console.log('mkDataView: row: ', i, ', depth: ', depth, ' path: ', path, ', isOpen: ', rowMap._isOpen)
    rowMap._isLeaf = depth > nPivots
    rowMap._id = i
    parentIdStack[ depth ] = i
    var parentId = (depth > 0) ? parentIdStack[ depth - 1 ] : null
    rowMap._parentId = parentId
    rowData.push(rowMap)
  }

  const outSchema = tableData.schema
    .extend('_id', {type: 'integer', displayName: '_id'})
    .extend('_parentId', {type: 'integer', displayName: '_parentId'})
    .extend('_isOpen', {type: 'integer', displayName: '_isOpen'})
    .extend('_isLeaf', {type: 'integer', displayName: '_isLeaf'})
  const dataView = new PagedDataView(outSchema, rowCount, offset, rowData)
  return dataView
}

/*
 * hacky opt for filter count: If empty filter, just retun baseRowCount
 */
const fastFilterRowCount = (rt: Connection,
  baseRowCount: number,
  condition: baseDialect.Condition,
  filterQuery: baseDialect.QueryExp): Promise<number> => {
  if (condition.filters.length === 0) {
    // short circuit!
    return baseRowCount
  }
  return rt.rowCount(filterQuery)
}

/*
 * hacky opt for using filterRowCount as viewRowCount if not pivoted
 */
const fastViewRowCount = (rt: Connection,
  filterRowCount: number,
  vpivots: Array<baseDialect.Field>,
  viewQuery: baseDialect.QueryExp): Promise<number> => {
  if (vpivots.length === 0) {
    // short circuit!
    return filterRowCount
  }
  return rt.rowCount(viewQuery)
}

/**
 * Use the current ViewParams to construct a QueryExp to send to
 * baseDialect using aggtree.
 * Map the resulting TableRep from the query into a PagedDataView for
 * use with SlickGrid
 */
const requestQueryView = async (rt: Connection,
    baseQuery: baseDialect.QueryExp,
    baseSchema: baseDialect.Schema,
    dialect: baseDialect.Dialect,
    viewParams: ViewParams): Promise<QueryView> => {
  const schemaFields = baseSchema.fields
  let aggMap = {}
  schemaFields.forEach((field) => {
    const cid = field.id
    aggMap[cid] = viewParams.aggMap[cid] || field.aggFn()
  })

  const filterQuery = baseQuery.filter(viewParams.condition)
  const ptree = await aggtree.vpivot(rt, filterQuery, baseSchema, dialect, viewParams.vpivots,
      viewParams.pivotLeafFieldId, viewParams.showRoot, viewParams.sortKey, aggMap)
  const treeQuery = await ptree.getSortedTreeQuery(viewParams.openPaths)

  // const t0 = performance.now()  // eslint-disable-line
  const baseRowCount = await rt.rowCount(baseQuery)
  const filterRowCount = await fastFilterRowCount(rt, baseRowCount, viewParams.condition, filterQuery)
  const rowCount = await fastViewRowCount(rt, filterRowCount, viewParams.vpivots, treeQuery)
  // const t1 = performance.now() // eslint-disable-line
  // console.log('gathering row counts took ', (t1 - t0) / 1000, ' sec')
  const ret = new QueryView({query: treeQuery, baseRowCount, filterRowCount, rowCount})
  return ret
}

const requestDataView = async (rt: Connection,
    viewParams: ViewParams,
    queryView: QueryView,
    offset: number,
    limit: number): Promise<PagedDataView> => {
  const tableData = await rt.evalQuery(queryView.query, offset, limit)
  const dataView = mkDataView(viewParams, queryView.rowCount, offset, tableData)
  return dataView
}

class Stack<T> {
  size: number
  arr: Array<T>

  constructor (size: number) {
    this.size = size;
    this.arr = []
  }

  push (elem: T): Stack<T> {
    this.arr.push(elem)

    if (this.arr.length > this.size) {
      this.arr = this.arr.slice(1, this.arr.length)
    }
    
    return this
  }
  
  pop (): T {
    return this.arr.pop()
  }

  top (): T {
    return this.arr[this.arr.length - 1]
  }
}

/**
 * A PivotRequester listens for changes on the appState and viewport and
 * manages issuing of query requests
 */
export default class PivotRequester {
  /*
   * 'pending' is really misnomer here -- for viewParams, offset and limit,
   * which are the parameters observed by PivotRequester, they are really
   * the 'most recent previous' parameters used to make an asynchronous request,
   * which may or may not have already completed.  We want this because we
   * need to compare application state changes with either what's currently
   * displayed OR a pending request.
   */
  pendingViewParams: Stack<?ViewParams>
  pendingQueryRequest: ?Promise<QueryView>
  pendingDataRequest: ?Promise<PagedDataView>
  currentQueryView: ?QueryView  // set when resolved
  pendingOffset: number
  pendingLimit: number

  constructor (stateRef: oneref.Ref<AppState>) {
    this.pendingQueryRequest = null
    this.currentQueryView = null
    this.pendingDataRequest = null
    this.pendingViewParams = new Stack(5) // Keep track of 5 previous viewParams for rollback purposes.
    stateRef.on('change', () => this.onStateChange(stateRef))
    // And invoke onStateChange initially to get things started:
    this.onStateChange(stateRef)
  }

  // issue a data request from current QueryView and
  // offset, limit:
  sendDataRequest (stateRef: oneref.Ref<AppState>,
               queryView: QueryView): Promise<PagedDataView> {
    const appState : AppState = stateRef.getValue()

    const viewState = appState.viewState
    const viewParams = viewState.viewParams
    const [offset, limit] =
      paging.fetchParams(viewState.viewportTop, viewState.viewportBottom)
    this.pendingOffset = offset
    this.pendingLimit = limit
    const dreq = requestDataView(appState.rtc, viewParams,
      queryView, offset, limit)
    this.pendingDataRequest = dreq
    dreq.then(dataView => {
      this.pendingDataRequest = null
      const appState = stateRef.getValue()
      const nextSt = appState.update('viewState', vs => {
        return (vs
          .update('loadingTimer', lt => lt.stop())
          .set('dataView', dataView))
      })
      stateRef.setValue(nextSt)
      return dataView
    })
    return dreq
  }

  onStateChange (stateRef: oneref.Ref<AppState>) {
    const appState : AppState = stateRef.getValue()

    const viewState = appState.viewState
    const viewParams = viewState.viewParams
    if (viewParams !== this.pendingViewParams.top()) {
      // console.log('onStateChange: requesting new query: ', viewState, this.pendingViewParams)
      // Might be nice to cancel any pending request here...
      // failing that we could calculate additional pages we need
      // if viewParams are same and only page range differs.
      this.pendingViewParams.push(viewParams)
      const qreq = requestQueryView(appState.rtc, appState.baseQuery,
        appState.baseSchema, appState.dialect, viewParams)
      this.pendingQueryRequest = qreq
      this.pendingDataRequest =
        qreq.then(queryView => {
          this.currentQueryView = queryView
          const appState = stateRef.getValue()
          const nextSt = appState
            .update('viewState', vs => {
            /*
             * queryView.rowCount may have changed since last data request;
             * trim viewport to ensure its in range
             */
              const [viewportTop, viewportBottom] =
              paging.clampViewport(queryView.rowCount, vs.viewportTop, vs.viewportBottom)
              return (vs
              .set('viewportTop', viewportTop)
              .set('viewportBottom', viewportBottom)
              .set('queryView', queryView))
            })

          const ltUpdater = util.pathUpdater(stateRef, ['viewState', 'loadingTimer'])
          const nextAppState = nextSt.updateIn(['viewState', 'loadingTimer'],
            lt => lt.run(200, ltUpdater))
          stateRef.setValue(nextAppState)

          return this.sendDataRequest(stateRef, queryView)
        })
        .catch(err => {
          log.error('PivotRequester: caught error updating view: ', err.message, err.stack)
          remoteErrorDialog('Error constructing view', err.message)
          // Remove this view params
          this.pendingViewParams.pop()

          // Now let's try and restore to previous view params:
          const appState = stateRef.getValue()
          const nextSt = appState.update('viewState', vs => {
            return (vs
              .update('loadingTimer', lt => lt.stop())
              .set('viewParams', this.pendingViewParams.pop()))
          })
          stateRef.setValue(nextSt)
        })
    } else {
      if (this.currentQueryView !== null &&
        !paging.contains(this.pendingOffset, this.pendingLimit, viewState.viewportTop, viewState.viewportBottom)) {
      // No change in view parameters, but check for viewport out of range of
      // pendingOffset, pendingLimit:
/*
        console.log('viewport outside bounds: pending: [' + this.pendingOffset +
        ', ' + (this.pendingOffset + this.pendingLimit) + ') ',
        ', viewport: ', viewState.viewportTop, viewState.viewportBottom)
*/
        const qv : QueryView = (this.currentQueryView : any)  // Flow misses null check above!
        this.sendDataRequest(stateRef, qv)
      }
    }
  }
}
