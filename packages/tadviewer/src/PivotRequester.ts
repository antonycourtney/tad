import * as reltab from "reltab";
import * as aggtree from "aggtree";
import { PagedDataView } from "./PagedDataView";
import { ViewParams } from "./ViewParams";
import { AppState } from "./AppState";
import { QueryView } from "./QueryView";
import { ReltabConnection, DbConnectionKey, DbConnection } from "reltab"; // eslint-disable-line

import * as oneref from "oneref"; // eslint-disable-line
import { mutableGet, addStateChangeListener } from "oneref";

import * as paging from "./paging";
import * as util from "./util";
import { ViewState } from "./ViewState";

// const remoteErrorDialog = require("electron").remote.getGlobal("errorDialog");
/**
 * Use ViewParams to construct a PagedDataView for use with
 * SlickGrid from reltab.TableRep
 */

interface RowMap {
  [s: string]: any;
  _depth: number;
}

const mkDataView = (
  viewParams: ViewParams,
  rowCount: number,
  offset: number,
  tableData: reltab.TableRep
): PagedDataView => {
  const getPath = (rowMap: RowMap, depth: number) => {
    let path: Array<string | null> = [];

    for (let i = 0; i < depth; i++) {
      let pathElem = rowMap["_path" + i] as string | null;
      path.push(pathElem);
    }

    return path;
  };

  var nPivots = viewParams.vpivots.length;
  var rowData = [];
  var parentIdStack = [];

  for (var i = 0; i < tableData.rowData.length; i++) {
    // ?? shouldn't we just be constructing the rowMap once and re-use it for every row??
    var rowMap: RowMap = tableData.rowData[i] as RowMap;
    var depth: number = rowMap._depth;
    var path = getPath(rowMap, depth);
    rowMap._isOpen = viewParams.openPaths.isOpen(path); // console.log('mkDataView: row: ', i, ', depth: ', depth, ' path: ', path, ', isOpen: ', rowMap._isOpen)

    rowMap._isLeaf = depth > nPivots;
    rowMap._id = i;
    parentIdStack[depth] = i;
    var parentId = depth > 0 ? parentIdStack[depth - 1] : null;
    rowMap._parentId = parentId;
    rowData.push(rowMap);
  }

  // TODO, 18May20: Do we really need this?  Seems surprising that we'd get back
  // a schema that didn't have these columns already.
  const outSchema = tableData.schema;
  /*
    .extend("_id", {
      type: "integer",
      displayName: "_id",
    })
    .extend("_parentId", {
      type: "integer",
      displayName: "_parentId",
    })
    .extend("_isOpen", {
      type: "integer",
      displayName: "_isOpen",
    })
    .extend("_isLeaf", {
      type: "integer",
      displayName: "_isLeaf",
    });
  */
  const dataView = new PagedDataView(outSchema, rowCount, offset, rowData);
  return dataView;
};
/*
 * hacky opt for filter count: If empty filter, just retun baseRowCount
 */

const fastFilterRowCount = async (
  rt: DbConnection,
  baseRowCount: number,
  filterExp: reltab.FilterExp,
  filterQuery: reltab.QueryExp
): Promise<number> => {
  if (filterExp.opArgs.length === 0) {
    // short circuit!
    return baseRowCount;
  }

  return rt.rowCount(filterQuery);
};
/*
 * hacky opt for using filterRowCount as viewRowCount if not pivoted
 */

const fastViewRowCount = async (
  rt: DbConnection,
  filterRowCount: number,
  vpivots: Array<string>,
  viewQuery: reltab.QueryExp
): Promise<number> => {
  if (vpivots.length === 0) {
    // short circuit!
    return filterRowCount;
  }

  return rt.rowCount(viewQuery);
};
/**
 * Use the current ViewParams to construct a QueryExp to send to
 * reltab using aggtree.
 * Map the resulting TableRep from the query into a PagedDataView for
 * use with SlickGrid
 */

const requestQueryView = async (
  rt: DbConnection,
  baseQuery: reltab.QueryExp,
  baseSchema: reltab.Schema,
  viewParams: ViewParams
): Promise<QueryView> => {
  const schemaCols = baseSchema.columns;
  const aggMap: any = {};

  for (let cid of schemaCols) {
    aggMap[cid] = viewParams.getAggFn(baseSchema, cid);
  }

  const filterQuery = baseQuery.filter(viewParams.filterExp);
  const ptree = await aggtree.vpivot(
    rt,
    filterQuery,
    baseSchema,
    viewParams.vpivots,
    viewParams.pivotLeafColumn,
    viewParams.showRoot,
    viewParams.sortKey,
    aggMap
  );
  const treeQuery = await ptree.getSortedTreeQuery(viewParams.openPaths); // const t0 = performance.now()  // eslint-disable-line

  const baseRowCount = await rt.rowCount(baseQuery);
  const filterRowCount = await fastFilterRowCount(
    rt,
    baseRowCount,
    viewParams.filterExp,
    filterQuery
  );
  const rowCount = await fastViewRowCount(
    rt,
    filterRowCount,
    viewParams.vpivots,
    treeQuery
  ); // const t1 = performance.now() // eslint-disable-line
  // console.log('gathering row counts took ', (t1 - t0) / 1000, ' sec')

  const ret = new QueryView({
    query: treeQuery,
    baseRowCount,
    filterRowCount,
    rowCount,
  });
  return ret;
};

const requestDataView = async (
  rt: DbConnection,
  viewParams: ViewParams,
  queryView: QueryView,
  offset: number,
  limit: number
): Promise<PagedDataView> => {
  // console.log("requestDataView: ", { query: queryView.query });
  const tableData = await rt.evalQuery(queryView.query, offset, limit);
  const dataView = mkDataView(
    viewParams,
    queryView.rowCount,
    offset,
    tableData
  );
  return dataView;
};
/**
 * A PivotRequester listens for changes on the appState and viewport and
 * manages issuing of query requests
 */

export class PivotRequester {
  /*
   * 'pending' is really misnomer here -- for viewParams, offset and limit,
   * which are the parameters observed by PivotRequester, they are really
   * the 'most recent previous' parameters used to make an asynchronous request,
   * which may or may not have already completed.  We want this because we
   * need to compare application state changes with either what's currently
   * displayed OR a pending request.
   */
  pendingViewParams: ViewParams | undefined | null;
  pendingQueryRequest: Promise<QueryView> | undefined | null;
  pendingDataRequest: Promise<void | PagedDataView> | undefined | null;
  currentQueryView: QueryView | undefined | null; // set when resolved

  pendingOffset: number;
  pendingLimit: number;

  constructor(stateRef: oneref.StateRef<AppState>) {
    this.pendingQueryRequest = null;
    this.currentQueryView = null;
    this.pendingDataRequest = null;
    this.pendingViewParams = null;
    this.pendingOffset = 0;
    this.pendingLimit = 0;
    addStateChangeListener(stateRef, (_) => {
      this.onStateChange(stateRef);
    });

    // And invoke onStateChange initially to get things started:
    this.onStateChange(stateRef);
  } // issue a data request from current QueryView and
  // offset, limit:

  sendDataRequest(
    stateRef: oneref.StateRef<AppState>,
    queryView: QueryView
  ): Promise<PagedDataView> {
    const appState: AppState = mutableGet(stateRef);
    const viewState = appState.viewState;
    const viewParams = viewState.viewParams;
    const [offset, limit] = paging.fetchParams(
      viewState.viewportTop,
      viewState.viewportBottom
    );
    this.pendingOffset = offset;
    this.pendingLimit = limit;
    const dreq = requestDataView(
      appState.dbc,
      viewParams,
      queryView,
      offset,
      limit
    );
    this.pendingDataRequest = dreq;
    dreq.then((dataView) => {
      this.pendingDataRequest = null;
      oneref.update(
        stateRef,
        (appState) =>
          appState.update(
            "viewState",
            (vs: ViewState) =>
              vs
                .update("loadingTimer", (lt) => lt.stop())
                .set("dataView", dataView) as ViewState
          ) as AppState
      );
      return dataView;
    });
    return dreq;
  }

  onStateChange(stateRef: oneref.StateRef<AppState>) {
    const appState: AppState = mutableGet(stateRef);
    const viewState = appState.viewState;
    const viewParams = viewState.viewParams;

    if (viewParams !== this.pendingViewParams) {
      /*
      console.log(
        "onStateChange: requesting new query: ",
        viewState.toJS(),
        this.pendingViewParams?.toJS()
      );
      */
      // Might be nice to cancel any pending request here...
      // failing that we could calculate additional pages we need
      // if viewParams are same and only page range differs.
      const prevViewParams = this.pendingViewParams;
      this.pendingViewParams = viewParams;
      const qreq = requestQueryView(
        appState.dbc,
        appState.baseQuery,
        appState.baseSchema,
        this.pendingViewParams
      );
      this.pendingQueryRequest = qreq;
      this.pendingDataRequest = qreq
        .then((queryView) => {
          this.currentQueryView = queryView;
          oneref.update(
            stateRef,
            (appState) =>
              appState.update("viewState", (vs: ViewState) => {
                /*
                 * queryView.rowCount may have changed since last data request;
                 * trim viewport to ensure its in range
                 */
                const [viewportTop, viewportBottom] = paging.clampViewport(
                  queryView.rowCount,
                  vs.viewportTop,
                  vs.viewportBottom
                );
                return vs
                  .set("viewportTop", viewportTop)
                  .set("viewportBottom", viewportBottom)
                  .set("queryView", queryView) as ViewState;
              }) as AppState
          );
          return this.sendDataRequest(stateRef, queryView);
        })
        .catch((err) => {
          console.error(
            "PivotRequester: caught error updating view: ",
            err.message,
            err.stack
          );
          // TODO:
          // remoteErrorDialog("Error constructing view", err.message); // Now let's try and restore to previous view params:
          oneref.update(
            stateRef,
            (appState) =>
              appState.update(
                "viewState",
                (vs: ViewState) =>
                  vs
                    .update("loadingTimer", (lt) => lt.stop())
                    .set("viewParams", prevViewParams) as ViewState
              ) as AppState
          );
        });
      const ltUpdater = util.pathUpdater(stateRef, [
        "viewState",
        "loadingTimer",
      ]);
      const nextAppState = appState.updateIn(
        ["viewState", "loadingTimer"],
        (lt) => lt.run(200, ltUpdater)
      ) as AppState;
      oneref.update(stateRef, (_) => nextAppState);
    } else {
      if (
        this.currentQueryView !== null &&
        !paging.contains(
          this.pendingOffset,
          this.pendingLimit,
          viewState.viewportTop,
          viewState.viewportBottom
        )
      ) {
        // No change in view parameters, but check for viewport out of range of
        // pendingOffset, pendingLimit:
        const qv: QueryView = this.currentQueryView as any; // Flow misses null check above!

        this.sendDataRequest(stateRef, qv);
      }
    }
  }
}
