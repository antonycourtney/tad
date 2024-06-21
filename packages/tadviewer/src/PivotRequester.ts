import log from "loglevel";
import * as reltab from "reltab";
import * as aggtree from "aggtree";
import { PagedDataView, DataRow } from "./PagedDataView";
import { ViewParams } from "./ViewParams";
import { AppState } from "./AppState";
import { QueryView } from "./QueryView";
import {
  ReltabConnection,
  DataSourceId,
  DataSourceConnection,
  getColumnHistogramMap,
  ColumnHistogramMap,
} from "reltab"; // eslint-disable-line

import * as oneref from "oneref"; // eslint-disable-line
import { mutableGet, addStateChangeListener } from "oneref";

import * as paging from "./paging";
import * as util from "./util";
import { ViewState } from "./ViewState";
import { Timer, TimerUpdater } from "./Timer";
import _ from "lodash";

// const remoteErrorDialog = require("electron").remote.getGlobal("errorDialog");
/**
 * Use ViewParams to construct a PagedDataView for use with
 * SlickGrid from reltab.TableRep
 */

const mkDataView = (
  viewParams: ViewParams,
  rowCount: number,
  offset: number,
  tableData: reltab.TableRep
): PagedDataView => {
  const getPath = (dataRow: DataRow, depth: number) => {
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
    var rowMap: DataRow = tableData.rowData[i] as DataRow;
    var depth: number = rowMap._depth;
    var path = getPath(rowMap, depth);
    rowMap._isOpen = viewParams.openPaths.isOpen(path);
    // console.log('mkDataView: row: ', i, ', depth: ', depth, ' path: ', path, ', isOpen: ', rowMap._isOpen)
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
  rt: DataSourceConnection,
  baseRowCount: number,
  filterExp: reltab.FilterExp,
  filterQuery: reltab.QueryExp,
  onViewRowCount?: (query: reltab.QueryExp) => void
): Promise<number> => {
  if (filterExp.opArgs.length === 0) {
    // short circuit!
    return baseRowCount;
  }

  onViewRowCount?.(filterQuery);
  return rt.rowCount(filterQuery);
};
/*
 * hacky opt for using filterRowCount as viewRowCount if not pivoted
 */

const fastViewRowCount = async (
  rt: DataSourceConnection,
  filterRowCount: number,
  vpivots: Array<string>,
  viewQuery: reltab.QueryExp,
  onViewRowCount?: (query: reltab.QueryExp) => void
): Promise<number> => {
  if (vpivots.length === 0) {
    // short circuit!
    return filterRowCount;
  }

  onViewRowCount?.(viewQuery);
  return rt.rowCount(viewQuery);
};
/**
 * Use the current ViewParams to construct a QueryExp to send to
 * reltab using aggtree.
 * Map the resulting TableRep from the query into a PagedDataView for
 * use with SlickGrid
 */

const requestQueryView = async (
  rt: DataSourceConnection,
  baseQuery: reltab.QueryExp,
  baseSchema: reltab.Schema,
  viewParams: ViewParams,
  showRecordCount: boolean,
  prevQueryView: QueryView | null | undefined,
  onViewQuery?: (
    query: reltab.QueryExp,
    offset?: number,
    limit?: number
  ) => void,
  onViewRowCount?: (query: reltab.QueryExp) => void
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
    aggMap,
    showRecordCount
  );
  const treeQuery = await ptree.getSortedTreeQuery(viewParams.openPaths); // const t0 = performance.now()  // eslint-disable-line

  onViewRowCount?.(baseQuery);
  const baseRowCount = await rt.rowCount(baseQuery);
  const filterRowCount = await fastFilterRowCount(
    rt,
    baseRowCount,
    viewParams.filterExp,
    filterQuery,
    onViewRowCount
  );
  const rowCount = await fastViewRowCount(
    rt,
    filterRowCount,
    viewParams.vpivots,
    treeQuery,
    onViewRowCount
  ); // const t1 = performance.now() // eslint-disable-line
  // console.log('gathering row counts took ', (t1 - t0) / 1000, ' sec')

  let histoMap: ColumnHistogramMap | null = null;
  if (
    viewParams.showColumnHistograms &&
    (prevQueryView == null ||
      prevQueryView.baseQuery !== baseQuery ||
      prevQueryView.histoMap == null)
  ) {
    const statsMap = await rt.getColumnStatsMap(baseQuery);
    histoMap = await getColumnHistogramMap(rt, baseQuery, baseSchema, statsMap);
  } else {
    if (prevQueryView != null) {
      histoMap = prevQueryView.histoMap;
    } else {
      histoMap = null;
    }
  }

  const ret = new QueryView({
    baseQuery,
    query: treeQuery,
    histoMap,
    baseRowCount,
    filterRowCount,
    rowCount,
  });
  return ret;
};

const requestDataView = async (
  rt: DataSourceConnection,
  viewParams: ViewParams,
  queryView: QueryView,
  offset: number,
  limit: number,
  onViewQuery?: (
    query: reltab.QueryExp,
    offset?: number,
    limit?: number
  ) => void
): Promise<PagedDataView> => {
  onViewQuery?.(queryView.query, offset, limit);
  const tableData = await rt.evalQuery(queryView.query, offset, limit);
  const dataView = mkDataView(
    viewParams,
    queryView.rowCount,
    offset,
    tableData
  );
  return dataView;
};

const vsUpdate =
  (f: (vs: ViewState) => ViewState) =>
  (s: AppState): AppState =>
    s.update("viewState", (vs: ViewState | null) =>
      vs == null ? null : f(vs)
    ) as AppState;

/* for debugging: */
function getObjectDiff(obj1: any, obj2: any) {
  const diff = Object.keys(obj1).reduce((result, key) => {
    if (!obj2.hasOwnProperty(key)) {
      result.push(key);
    } else if (_.isEqual(obj1[key], obj2[key])) {
      const resultKeyIndex = result.indexOf(key);
      result.splice(resultKeyIndex, 1);
    }
    return result;
  }, Object.keys(obj2));

  return diff;
}

const noopSetLoadingCallback = (loading: boolean) => {};

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
  errorCallback?: (e: Error) => void;
  setLoadingCallback: (loading: boolean) => void;

  onViewQuery?: (
    query: reltab.QueryExp,
    offset?: number,
    limit?: number
  ) => void;
  onViewRowCount?: (query: reltab.QueryExp) => void;

  constructor(
    stateRef: oneref.StateRef<AppState>,
    errorCallback?: (e: Error) => void,
    setLoadingCallback?: (loading: boolean) => void,
    onViewQuery?: (
      query: reltab.QueryExp,
      offset?: number,
      limit?: number
    ) => void,
    onViewRowCount?: (query: reltab.QueryExp) => void
  ) {
    const appState = mutableGet(stateRef);
    this.pendingQueryRequest = null;
    this.currentQueryView = null;
    this.pendingDataRequest = null;
    this.pendingViewParams = null;
    this.pendingOffset = 0;
    this.pendingLimit = 0;
    this.errorCallback = errorCallback;
    this.setLoadingCallback = setLoadingCallback || noopSetLoadingCallback;
    this.onViewQuery = onViewQuery;
    this.onViewRowCount = onViewRowCount;

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
    this.setLoadingCallback(true);
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
      viewState.dbc,
      viewParams,
      queryView,
      offset,
      limit,
      this.onViewQuery
    );
    this.pendingDataRequest = dreq;
    dreq.then((dataView) => {
      this.pendingDataRequest = null;
      oneref.update(
        stateRef,
        vsUpdate(
          (vs: ViewState) =>
            vs
              .update("loadingTimer", (lt) => lt.stop())
              .set("dataView", dataView) as ViewState
        )
      );
      this.setLoadingCallback(false);
      return dataView;
    });
    return dreq;
  }

  onStateChange(stateRef: oneref.StateRef<AppState>) {
    const appState: AppState = mutableGet(stateRef);
    const viewState = appState.viewState;

    if (viewState === null) {
      return;
    }

    const { queryView } = viewState;
    const viewParams = viewState.viewParams;

    if (viewParams !== this.pendingViewParams) {
      /*
      log.debug(
        "*** onStateChange: requesting new query: ",
        viewState.toJS(),
        this.pendingViewParams?.toJS()
      );
      */
      /*
      const viewStateJS = viewState.toJS();
      const pendingJS = this.pendingViewParams?.toJS();
      if (viewStateJS && pendingJS) {
        const diffs = getObjectDiff(
          viewState.toJS(),
          this.pendingViewParams?.toJS()
        );
        console.log("*** state change diffs: ", diffs);
      }
      */

      // Might be nice to cancel any pending request here...
      // failing that we could calculate additional pages we need
      // if viewParams are same and only page range differs.
      const prevViewParams = this.pendingViewParams as ViewParams;
      this.pendingViewParams = viewParams;
      // NOTE!  Very important to pass queryView (latest from appState) and not
      // this.currentQueryView, which may be stale.
      // TODO:  The sequencing and control flow here is really subtle; we should rework this to make
      // it easier to reason about the sequencing.
      const qreq = requestQueryView(
        viewState.dbc,
        viewState.baseQuery,
        viewState.baseSchema,
        this.pendingViewParams,
        appState.showRecordCount,
        queryView,
        this.onViewQuery,
        this.onViewRowCount
      );
      this.pendingQueryRequest = qreq;
      this.pendingDataRequest = qreq
        .then((queryView) => {
          this.currentQueryView = queryView;
          oneref.update(
            stateRef,
            vsUpdate((vs: ViewState) => {
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
            })
          );
          /*
          log.debug(
            "*** onStateChange: sending request to satisfy view state update"
          );
          */
          return this.sendDataRequest(stateRef, queryView);
        })
        .catch((err) => {
          console.error(
            "PivotRequester: caught error updating view: ",
            err.message,
            err.stack
          );
          this.setLoadingCallback(false);
          // TODO:
          // remoteErrorDialog("Error constructing view", err.message); // Now let's try and restore to previous view params:
          oneref.update(
            stateRef,
            vsUpdate((vs: ViewState) =>
              vs.update("loadingTimer", (lt) => lt.stop())
            )
          );
          if (this.errorCallback) {
            this.errorCallback(err instanceof Error ? err : new Error(err));
          }
        });
      const ltUpdater = util.pathUpdater<AppState, Timer>(stateRef, [
        "viewState",
        "loadingTimer",
      ]);
      const nextAppState = appState.updateIn(
        ["viewState", "loadingTimer"],
        (lt) => (lt as Timer).run(200, ltUpdater as unknown as TimerUpdater)
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
        /*
        log.debug(
          "*** onStateChange: sending request because paging parameters out of viewport: ",
          this.pendingOffset,
          this.pendingLimit,
          viewState.viewportTop,
          viewState.viewportBottom
        );
        */
        this.sendDataRequest(stateRef, qv);
      }
    }
  }
}
