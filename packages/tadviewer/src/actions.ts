import { ViewParams } from "./ViewParams";
import { ViewState } from "./ViewState";
import { AppState } from "./AppState";
import * as reltab from "reltab";
import { Activity, ColumnListTypes } from "./components/defs";
import { Path, PathTree } from "aggtree";
import * as aggtree from "aggtree";
import { StateRef, update, mutableGet, awaitableUpdate_ } from "oneref";
import log from "loglevel";
import {
  DataSourcePath,
  DataSourceId,
  resolvePath,
  DataSourceConnection,
  and,
  col,
  constVal,
  NumericColumnHistogramData,
  SubExp,
  FilterExp,
} from "reltab";
import * as util from "./util";
import { QueryView } from "./QueryView";

export async function initAppState(
  rtc: reltab.ReltabConnection,
  stateRef: StateRef<AppState>
): Promise<void> {
  const st = await awaitableUpdate_(
    stateRef,
    (st: AppState): AppState =>
      st.set("rtc", rtc).set("initialized", true) as AppState
  );
  console.log("initAppState: st: ", st.toJS());
}

export async function setActivity(
  activity: Activity,
  stateRef: StateRef<AppState>
) {
  await awaitableUpdate_(
    stateRef,
    (st: AppState) => st.set("activity", activity) as AppState
  );
}

export async function startAppLoadingTimer(
  stateRef: StateRef<AppState>
): Promise<void> {
  // hard to precisely type the path-dependent type of pathUpdater, so use any
  const ltUpdater = util.pathUpdater(stateRef, ["appLoadingTimer"]) as any;
  update(
    stateRef,
    (st: AppState): AppState =>
      st.set(
        "appLoadingTimer",
        st.appLoadingTimer.run(200, ltUpdater)
      ) as AppState
  );
}

export async function stopAppLoadingTimer(
  stateRef: StateRef<AppState>
): Promise<void> {
  update(
    stateRef,
    (st: AppState): AppState =>
      st.set("appLoadingTimer", st.appLoadingTimer.stop()) as AppState
  );
}

// replace current view in AppState with a query on the specified
// dataSource
export const setQueryView = async (
  stateRef: StateRef<AppState>,
  dsc: DataSourceConnection,
  sqlQuery: string,
  showColumnHistograms: boolean
): Promise<void> => {
  const appState = mutableGet(stateRef);

  // console.log("replaceCurrentView: queryTableName: ", dsPath, queryTableName);

  const baseQuery = reltab.sqlQuery(sqlQuery);
  const baseSchema = await aggtree.getBaseSchema(
    dsc,
    baseQuery,
    appState.showRecordCount
  );

  // start off with all columns displayed:
  const displayColumns = baseSchema.columns.slice();

  const openPaths = new PathTree();
  const initialViewParams = new ViewParams({
    displayColumns,
    openPaths,
    showColumnHistograms,
  });

  const viewState = new ViewState({
    dbc: dsc,
    baseSchema,
    baseQuery,
    viewParams: initialViewParams,
    initialViewParams,
  });

  // We explicitly set rather than merge() because merge
  // will attempt to deep convert JS objects to Immutables

  await awaitableUpdate_(
    stateRef,
    (st: AppState): AppState => st.set("viewState", viewState) as AppState
  );
};

export const replaceCurrentView = async (
  dsPath: DataSourcePath,
  stateRef: StateRef<AppState>,
  viewParams?: ViewParams
): Promise<void> => {
  console.log("*** replaceCurrentView: dsPath: ", dsPath);
  const appState = mutableGet(stateRef);

  const targetNode = await resolvePath(appState.rtc, dsPath);
  if (targetNode.isContainer) {
    await setActivity("DataSource", stateRef);
    return;
  }

  const dbc = await appState.rtc.connect(dsPath.sourceId);

  const { path } = dsPath;
  const baseTableName = path[path.length - 1];

  const windowTitle = baseTableName;

  const queryTableName = await dbc.getTableName(dsPath);

  // console.log("replaceCurrentView: queryTableName: ", dsPath, queryTableName);

  const baseQuery = reltab.tableQuery(queryTableName);
  const baseSchema = await aggtree.getBaseSchema(
    dbc,
    baseQuery,
    appState.showRecordCount
  );

  // start off with all columns displayed:
  const displayColumns = baseSchema.columns.slice();

  const openPaths = new PathTree();
  if (!viewParams) {
    viewParams = new ViewParams({
      displayColumns,
      openPaths,
    });
  }
  const initialViewParams = viewParams;

  const viewState = new ViewState({
    dbc,
    dsPath,
    baseSchema,
    baseQuery,
    viewParams,
    initialViewParams,
  });

  // We explicitly set rather than merge() because merge
  // will attempt to deep convert JS objects to Immutables

  await awaitableUpdate_(
    stateRef,
    (st: AppState): AppState => st.set("viewState", viewState) as AppState
  );
};

export const openDataSourcePath = async (
  path: DataSourcePath,
  stateRef: StateRef<AppState>,
  viewParams?: ViewParams
): Promise<void> => {
  const appState = mutableGet(stateRef);

  const modifiedViewParams =
    appState.viewState?.viewParams !== appState.viewState?.initialViewParams;

  if (modifiedViewParams) {
    setViewConfirmDialogOpen(true, path, stateRef);
  } else {
    try {
      await startAppLoadingTimer(stateRef);
      await replaceCurrentView(path, stateRef, viewParams);
    } finally {
      stopAppLoadingTimer(stateRef);
    }
  }
};

// helper to hoist a ViewParams => ViewParams fn to an AppState => AppState
// Always resets the viewport
const vpUpdate =
  (f: (vp: ViewParams) => ViewParams) =>
  (s: AppState): AppState =>
    s.updateIn(["viewState", "viewParams"], (vpu: unknown) =>
      f(vpu as ViewParams)
    ) as AppState;

export const toggleShown = (
  cid: string,
  stateRef: StateRef<AppState>
): void => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.toggleShown(cid))
  );
};
export const toggleAllShown = (stateRef: StateRef<AppState>): void => {
  update(stateRef, (s) => {
    const schema = s.viewState.baseSchema;
    const viewParams = s.viewState.viewParams;
    const allShown = schema.columns.length === viewParams.displayColumns.length;
    const nextDisplayColumns = allShown ? [] : schema.columns;
    return vpUpdate(
      (viewParams) =>
        viewParams.set("displayColumns", nextDisplayColumns) as ViewParams
    )(s);
  });
};
export const togglePivot = (
  cid: string,
  stateRef: StateRef<AppState>
): void => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.togglePivot(cid))
  );
};
export const toggleSort = (cid: string, stateRef: StateRef<AppState>): void => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.toggleSort(cid))
  );
};
export const setSortDir = (
  cid: string,
  asc: boolean,
  stateRef: StateRef<AppState>
): void => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.setSortDir(cid, asc))
  );
};
export const toggleShowRoot = (stateRef: StateRef<AppState>): void => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.set("showRoot", !viewParams.showRoot) as ViewParams
    )
  );
};
export const setShowColumnHistograms = (
  stateRef: StateRef<AppState>,
  showColumnHistograms: boolean
): void => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.set(
          "showColumnHistograms",
          showColumnHistograms
        ) as ViewParams
    )
  );
};
export const toggleShowColumnHistograms = (
  stateRef: StateRef<AppState>
): void => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.set(
          "showColumnHistograms",
          !viewParams.showColumnHistograms
        ) as ViewParams
    )
  );
};

export const reorderColumnList = (dstProps: any, srcProps: any) => {
  console.log("reorderColumnList: ", dstProps, srcProps);

  if (dstProps.columnListType !== srcProps.columnListType) {
    console.log("mismatched column list types, ignoring...");
    return;
  }

  const fieldKey = dstProps.columnListType;
  const isSortKey = fieldKey === ColumnListTypes.SORT;
  update(
    dstProps.stateRef,
    vpUpdate((viewParams) => {
      let colList = viewParams.get(fieldKey).slice();

      if (isSortKey) {
        const srcSortKey = srcProps.rowData;
        const srcIndex = colList.findIndex((k: any) => k[0] === srcSortKey[0]);

        if (srcIndex === -1) {
          return viewParams;
        } // remove source from its current position:

        colList.splice(srcIndex, 1);
        const dstSortKey = dstProps.rowData;
        const dstIndex = colList.findIndex((k: any) => k[0] === dstSortKey[0]);

        if (dstIndex === -1) {
          return viewParams;
        }

        colList.splice(dstIndex, 0, srcSortKey);
        return viewParams.set(fieldKey, colList) as ViewParams;
      } else {
        const srcColumnId = srcProps.rowData;
        const srcIndex = colList.indexOf(srcColumnId);

        if (srcIndex === -1) {
          return viewParams;
        } // remove source from its current position:

        colList.splice(srcIndex, 1);
        const dstColumnId = dstProps.rowData;
        const dstIndex = colList.indexOf(dstColumnId);

        if (dstIndex === -1) {
          return viewParams;
        }

        colList.splice(dstIndex, 0, srcColumnId);

        if (fieldKey === "vpivots") {
          // evil hack
          return viewParams.setVPivots(colList);
        } else {
          return viewParams.set(fieldKey, colList) as ViewParams;
        }
      }
    })
  );
};
/*
 * single column version of setting sort key
 * (until we implement compound sort keys)
 */

export const setSortKey = (
  sortKey: Array<[string, boolean]>,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (st: AppState): AppState => {
    const nextSt = vpUpdate(
      (viewParams) => viewParams.set("sortKey", sortKey) as ViewParams
    )(st);
    return nextSt;
  });
};

export const setColumnOrder = (
  displayColumns: Array<string>,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.set("displayColumns", displayColumns) as ViewParams
    )
  );
};

export const openPath = (path: Path, stateRef: StateRef<AppState>) => {
  log.info("openPath: opening path: ", path);
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.openPath(path))
  );
};

export const closePath = (path: Path, stateRef: StateRef<AppState>) => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.closePath(path))
  );
};

export const setAggFn = (
  cid: string,
  aggFn: reltab.AggFn,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.setAggFn(cid, aggFn))
  );
};

export const updateViewport = (
  top: number,
  bottom: number,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    (st) =>
      st.update(
        "viewState",
        (vs) =>
          vs!.set("viewportTop", top).set("viewportBottom", bottom) as ViewState
      ) as AppState
  );
};

export const setDefaultFormatOptions = (
  colType: string,
  opts: any,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.setIn(["defaultFormats", colType], opts) as ViewParams
    )
  );
};

export const setColumnFormatOptions = (
  cid: string,
  opts: any,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.setColumnFormat(cid, opts))
  );
};

export const setShowHiddenCols = (
  show: boolean,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) => viewParams.set("showHiddenCols", show) as ViewParams
    )
  );
};

export const setExportDialogOpen = (
  openState: boolean,
  saveFilename: string,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    (s) =>
      s
        .set("exportDialogOpen", openState)
        .set("exportFilename", saveFilename) as AppState
  );
};

export const setViewConfirmDialogOpen = (
  openState: boolean,
  path: DataSourcePath | null,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    (s) =>
      s
        .set("viewConfirmDialogOpen", openState)
        .set("viewConfirmSourcePath", path) as AppState
  );
};

export const setExportProgress = (
  percentComplete: number,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) => s.set("exportPercent", percentComplete) as AppState);
};

export const setFilter = (
  fe: reltab.FilterExp,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.set("filterExp", fe) as ViewParams)
  );
};

export const setHistogramBrushFilter = (
  colId: string,
  range: [number, number] | null,
  stateRef: StateRef<AppState>
) => {
  let baseFE: FilterExp;
  if (range !== null) {
    const appState = mutableGet(stateRef);
    const prevFE = appState.viewState.viewParams.filterExp;
    // ensure that prevFE is either null or a top-level "AND" operator:
    if (prevFE != null) {
      if (prevFE.op !== "AND") {
        log.info(
          "setHistogramBrushFilter: unexpected structure for current filter expression, ignoring brush filter"
        );
        return;
      }
      // drop any previous mentions of colId from the filter expression:
      const cleanOpArgs = prevFE.opArgs.filter((subExp: SubExp) => {
        if (subExp.expType === "BinRelExp") {
          const lhs = subExp.lhs;
          if (lhs.expType === "ColRef" && lhs.colName === colId) {
            return false;
          }
        }
        return true;
      });
      baseFE = new FilterExp("AND", cleanOpArgs);
    } else {
      baseFE = and();
    }
    const nextFE = baseFE
      .ge(col(colId), constVal(range[0]))
      .le(col(colId), constVal(range[1]));
    update(
      stateRef,
      vpUpdate(
        (viewParams) => viewParams.set("filterExp", nextFE) as ViewParams
      )
    );
  }
};

export const setHistogramBrushRange = (
  colId: string,
  range: [number, number] | null,
  stateRef: StateRef<AppState>
) => {
  if (range !== null) {
    update(
      stateRef,
      (st: AppState): AppState =>
        st.updateIn(["viewState", "queryView"], (qvu: unknown) => {
          const oldQueryView = qvu as QueryView;
          const oldHistData = oldQueryView.histoMap[colId];
          const newHistData: NumericColumnHistogramData = {
            ...oldHistData,
            brushMinVal: range[0],
            brushMaxVal: range[1],
          };
          const newHistoMap = {
            ...oldQueryView.histoMap,
            [colId]: newHistData,
          };
          const newQueryView = oldQueryView.set("histoMap", newHistoMap);
          return newQueryView;
        }) as AppState
    );
  }
};

/*
 * TODO: dead code?
export const ensureDistinctColVals = (colId: string, stateRef: StateRef<AppState>) => {
  update(stateRef, appState => {
    const updSet = appState.requestedColumnVals.add(colId);
    return appState.set("requestedColumnVals", updSet);
  });
};
*/
