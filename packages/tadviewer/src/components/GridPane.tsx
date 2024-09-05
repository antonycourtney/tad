import _ from "lodash";
import { mutableGet, StateRef } from "oneref";
import * as React from "react";
import { useRef } from "react";
import * as reltab from "reltab";
import { AppState } from "../AppState";
import { DataRow } from "../PagedDataView";
import { ViewState } from "../ViewState";
import * as actions from "../actions";
import * as util from "../util";
import { DataGrid, DataGridProps } from "./DataGrid";
import { SimpleClipboard } from "./SimpleClipboard";

import { CellClickData } from "./CellClickData";
import { SelectionChangeData } from "./SelectionChangeData";

export type OpenURLFn = (url: string) => void;

export interface GridPaneProps {
  appState: AppState;
  viewState: ViewState;
  stateRef: StateRef<AppState>;
  clipboard: SimpleClipboard;
  openURL: OpenURLFn;
  embedded: boolean;
  onCellClick?: (cell: CellClickData) => void;
  onSelectionChange?: (data: SelectionChangeData) => void;
}

// GridPaneInternal the un-memoized GridPane component
const GridPaneInternal: React.FunctionComponent<GridPaneProps> = ({
  appState,
  viewState,
  stateRef,
  clipboard,
  openURL,
  embedded,
  onCellClick,
  onSelectionChange,
}) => {
  const viewStateRef = useRef<ViewState>(viewState);

  viewStateRef.current = viewState;

  // Only show loading modal if we've been loading more than 500 ms
  const lt = viewState.loadingTimer;
  const showLoadingModal = lt.running && lt.elapsed > 500;

  const { dataView, viewParams } = viewState;
  const { showColumnHistograms } = viewState.viewParams;
  const histoMap = viewState.queryView?.histoMap;

  const getColumnFormatter = React.useCallback(
    (schema: reltab.Schema, cid: string) =>
      viewState.viewParams.getColumnFormatter(schema, cid),
    [viewState.viewParams]
  );

  const getColumnCssClassName = React.useCallback(
    (schema: reltab.Schema, cid: string) =>
      viewState.viewParams.getColumnClassName(schema, cid),
    [viewState.viewParams]
  );

  let pivotColumnDisplayName = "";
  if (dataView) {
    const { schema } = dataView;
    const pivotNames = viewParams.vpivots.map((cid) => schema.displayName(cid));
    const leafCid = viewParams.pivotLeafColumn;
    let leafPivotStr = leafCid ? " > " + schema.displayName(leafCid) : "";
    pivotColumnDisplayName = "Pivot: " + pivotNames.join(" > ") + leafPivotStr;
  }

  const showHiddenColumns = viewParams.showHiddenCols;
  const displayColumns = viewParams.displayColumns;

  const onViewportChanged = React.useCallback(
    (top: number, bottom: number) => {
      actions.updateViewport(top, bottom, stateRef);
    },
    [stateRef]
  );

  const onHistogramBrushRange = React.useCallback(
    (cid: string, range: [number, number] | null) => {
      actions.setHistogramBrushRange(cid, range, stateRef);
    },
    [stateRef]
  );

  const onHistogramBrushFilter = React.useCallback(
    (cid: string, range: [number, number] | null) => {
      actions.setHistogramBrushFilter(cid, range, stateRef);
    },
    [stateRef]
  );

  const onSetSortKey = React.useCallback(
    (sortKey: [string, boolean][]) => {
      actions.setSortKey(sortKey, stateRef);
    },
    [stateRef]
  );
  const sortKey = viewParams.sortKey;

  const onGridSelectionChange = React.useCallback(
    (
      anchor: { row: number; column: number },
      focus: { row: number; column: number },
      columns: string[],
      items: any[][]
    ) => {
      const appState = mutableGet(stateRef);
      const { viewState } = appState;
      if (onSelectionChange) {
        const columnData: {
          columnId: string;
          displayName: string;
          columnType: string;
        }[] = [];
        columns.map((column) => {
          columnData.push({
            ...viewState?.baseSchema.columnMetadata[column],
            columnId: column,
          });
        });
        onSelectionChange({
          selectedGridItems: items,
          columns: columnData,
          gridAnchor: anchor,
          gridFocus: focus,
        });
      }
    },
    []
  );

  const onGridClick = React.useCallback(
    (
      row: number,
      column: number,
      item: DataRow,
      columnId: string,
      cellVal: any
    ) => {
      const appState = mutableGet(stateRef);
      const { viewState } = appState;
      const { viewParams, dataView } = viewState;
      // log.info("onGridClick: item: ", item);

      if (onCellClick) {
        const columnData =
          viewState?.baseSchema.columnMetadata[columnId] ?? null;
        onCellClick({
          value: cellVal,
          column: { ...columnData, columnId },
          cell: { row, col: column },
        });
      }

      if (columnId === "_pivot") {
        if (item._isLeaf) {
          return;
        }
        const vpivots = viewParams.vpivots;
        const depth = item._depth;
        let path: string[] = [];
        for (let i = 0; i < vpivots.length && i < depth; i++) {
          let pathItem = item["_path" + i];
          path.push(item["_path" + i] as string);
        }
        // log.info("onGridClick: path: ", path);
        if (item._isOpen) {
          actions.closePath(path, stateRef);
        } else {
          actions.openPath(path, stateRef);
        }
      } else {
        if (dataView?.schema.columnIndex(columnId)) {
          const ch = viewParams.getClickHandler(dataView.schema, columnId);
          ch({ openURL }, row, column, cellVal);
        }
      }
    },
    [stateRef]
  );

  const onSetColumnOrder = React.useCallback(
    (columnIds: string[]) => {
      actions.setColumnOrder(columnIds, stateRef);
    },
    [stateRef]
  );

  const isPivoted = viewParams.vpivots.length > 0;

  const dataGridProps: DataGridProps = {
    dataView,
    showColumnHistograms,
    histoMap,
    getColumnFormatter,
    getColumnCssClassName,
    pivotColumnDisplayName,
    showLoadingModal,
    showHiddenColumns,
    displayColumns,
    onViewportChanged,
    onHistogramBrushRange,
    onHistogramBrushFilter,
    onSetSortKey,
    onGridClick,
    onGridSelectionChange,
    onSetColumnOrder,
    sortKey,
    isPivoted,
    clipboard,
    openURL,
    embedded,
  };

  return <DataGrid {...dataGridProps} />;
};

// TODO: It might be better to move this memoization down a level into DataGrid,
// but we'll leave it here for now
const gridPanePropsEqual = (oldProps: any, nextProps: any): boolean => {
  const viewState = oldProps.viewState;
  const nextViewState = nextProps.viewState;
  const omitPred = (val: any, key: string, obj: Object) =>
    key.startsWith("viewport");
  // N.B.: We use toObject rather than toJS because we only want a
  // shallow conversion
  const vs = _.omitBy(viewState.toObject(), omitPred);
  const nvs = _.omitBy(nextViewState.toObject(), omitPred);
  const ret =
    util.shallowEqual(vs, nvs) &&
    oldProps.appState.showColumnHistograms ===
      nextProps.appState.showColumnHistograms;
  return ret;
};

export const GridPane = React.memo(GridPaneInternal, gridPanePropsEqual);
