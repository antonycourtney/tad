import { ViewParams } from "./ViewParams";
import { ViewState } from "./ViewState";
import { AppState } from "./AppState";
import * as reltab from "reltab";
import { ColumnListTypes } from "./components/defs";
import { Path, PathTree } from "aggtree";
import * as aggtree from "aggtree";
import { StateRef, update, mutableGet, awaitableUpdate_ } from "oneref";
import log from "loglevel";
import { DataSourcePath, DbConnectionKey } from "reltab";

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

export const openDataSourcePath = async (
  path: DataSourcePath,
  stateRef: StateRef<AppState>
): Promise<void> => {
  console.log("openDataSourcePath: path: ", path);
  const appState = mutableGet(stateRef);

  const dbConnKey = path[0].id as DbConnectionKey;
  const dbc = await appState.rtc.connect(dbConnKey, path[0].displayName);

  const tableName = path[path.length - 1].id as string;

  // TODO: This shouldn't actually be needed, but let's do it for now:
  console.log("openDataSourcePath: calling getTableInfo: ", dbc, tableName);
  const ti = await dbc.getTableInfo(tableName);
  console.log("openPath: tableInfo: ", ti);

  const windowTitle = tableName;
  const baseQuery = reltab.tableQuery(tableName);
  const baseSchema = await aggtree.getBaseSchema(dbc, baseQuery);

  // start off with all columns displayed:
  const displayColumns = baseSchema.columns.slice();

  const openPaths = new PathTree();
  const viewParams = new ViewParams({
    displayColumns,
    openPaths,
  });

  const viewState = new ViewState({
    dbc,
    path,
    baseSchema,
    baseQuery,
    viewParams,
  }); // We explicitly set rather than merge() because merge
  // will attempt to deep convert JS objects to Immutables

  update(
    stateRef,
    (st: AppState): AppState => st.set("viewState", viewState) as AppState
  );
};

// helper to hoist a ViewParams => ViewParams fn to an AppState => AppState
// Always resets the viewport
const vpUpdate = (f: (vp: ViewParams) => ViewParams) => (
  s: AppState
): AppState => s.updateIn(["viewState", "viewParams"], f) as AppState;

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
  console.log("setSortKey: ", sortKey);
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.set("sortKey", sortKey) as ViewParams)
  );
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
          vs.set("viewportTop", top).set("viewportBottom", bottom) as ViewState
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

/*
 * TODO: dead code?
export const ensureDistinctColVals = (colId: string, stateRef: StateRef<AppState>) => {
  update(stateRef, appState => {
    const updSet = appState.requestedColumnVals.add(colId);
    return appState.set("requestedColumnVals", updSet);
  });
};
*/
