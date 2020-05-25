// for debugging resize handler:
// import $ from 'jquery'
import * as React from "react";
import _ from "lodash";

/* /// <reference path="slickgrid-es6.d.ts"> */
import * as SlickGrid from "slickgrid-es6";
import WindowSizeListener from "react-window-size-listener";
import * as reltab from "reltab";
import * as actions from "../actions";
import { LoadingModal } from "./LoadingModal";
import { PagedDataView } from "../PagedDataView";
import { ViewParams } from "../ViewParams";
import * as util from "../util";
// import { clipboard } from "electron";
import { ExportToCsv } from "export-to-csv";
import * as he from "he";
import { AppState } from "../AppState";
import { ViewState } from "../ViewState";
import { StateRef } from "oneref";
import { useState, useRef, MutableRefObject } from "react";
import log from "loglevel";

const { Slick } = SlickGrid;
const { Plugins } = SlickGrid as any;
const { CellRangeSelector, CellSelectionModel, CellCopyManager } = Plugins;

const container = "#epGrid"; // for now

const gridOptions = {
  multiColumnSort: true,
};

const INDENT_PER_LEVEL = 15; // pixels

const calcIndent = (depth: number): number => INDENT_PER_LEVEL * depth;

/*
 * Formatter for cells in pivot column
 */
const groupCellFormatter = (
  row: any,
  cell: any,
  value: any,
  columnDef: any,
  item: any
) => {
  const toggleCssClass = "slick-group-toggle";
  const toggleExpandedCssClass = "expanded";
  const toggleCollapsedCssClass = "collapsed";
  const groupTitleCssClass = "slick-group-title";

  var indentation = calcIndent(item._depth) + "px";

  var pivotStr = item._pivot || "";

  const expandClass = !item._isLeaf
    ? item._isOpen
      ? toggleExpandedCssClass
      : toggleCollapsedCssClass
    : "";
  const ret = `
<span class='${toggleCssClass} ${expandClass}' style='margin-left: ${indentation}'>
</span>
<span class='${groupTitleCssClass}' level='${item._depth}'>${pivotStr}</span>`;
  return ret;
};

// scan table data to make best effort at initial column widths
const MINCOLWIDTH = 80;
const MAXCOLWIDTH = 300;

// TODO: use real font metrics:
const measureStringWidth = (s: string): number => 8 + 5.5 * s.length;
const measureHeaderStringWidth = (s: string): number => 24 + 5.5 * s.length;

// get column width for specific column:
const getColWidth = (dataView: PagedDataView, cnm: string) => {
  let colWidth;
  const offset = dataView.getOffset();
  const limit = offset + dataView.getItemCount();
  for (var i = offset; i < limit; i++) {
    var row = dataView.getItem(i);
    var cellVal = row[cnm];
    var cellWidth = MINCOLWIDTH;
    if (cellVal) {
      cellWidth = measureStringWidth(cellVal.toString());
    }
    if (cnm === "_pivot") {
      cellWidth += calcIndent(row._depth + 2);
    }
    colWidth = Math.min(
      MAXCOLWIDTH,
      Math.max(colWidth || MINCOLWIDTH, cellWidth)
    );
  }
  const displayName = dataView.schema.displayName(cnm);
  const headerStrWidth = measureHeaderStringWidth(displayName);
  colWidth = Math.min(
    MAXCOLWIDTH,
    Math.max(colWidth || MINCOLWIDTH, headerStrWidth)
  );
  return colWidth;
};

type ColWidthMap = { [cid: string]: number };

function getInitialColWidthsMap(dataView: PagedDataView): ColWidthMap {
  // let's approximate the column width:
  var colWidths: ColWidthMap = {};
  var nRows = dataView.getLength();
  if (nRows === 0) {
    return {};
  }
  const initRow = dataView.getItem(0);
  for (let cnm in initRow) {
    colWidths[cnm] = getColWidth(dataView, cnm);
  }

  return colWidths;
}

/*
 * Construct map of SlickGrid column descriptors from base schema
 * and column width info
 *
 * Map should contain entries for all column ids
 */
const mkSlickColMap = (
  schema: reltab.Schema,
  viewParams: ViewParams,
  colWidths: ColWidthMap
) => {
  let slickColMap: any = {};

  // hidden columns:
  slickColMap["_id"] = { id: "_id", field: "_id", name: "_id" };
  slickColMap["_parentId"] = {
    id: "_parentId",
    field: "_parentId",
    name: "_parentId",
  };
  for (let colId of schema.columns) {
    let cmd = schema.columnMetadata[colId];
    if (!cmd) {
      console.error("could not find column metadata for ", colId, schema);
    }
    let ci: any = {
      id: colId,
      field: colId,
      cssClass: "",
      name: "",
      formatter: null,
    };
    if (colId === "_pivot") {
      const pivotNames = viewParams.vpivots.map((cid) =>
        schema.displayName(cid)
      );
      const leafCid = viewParams.pivotLeafColumn;
      let leafPivotStr = leafCid ? " > " + schema.displayName(leafCid) : "";
      const pivotDisplayName =
        "Pivot: " + pivotNames.join(" > ") + leafPivotStr;
      ci.cssClass = "pivot-column";
      ci.name = he.encode(pivotDisplayName);
      ci.toolTip = pivotDisplayName;
      ci.formatter = groupCellFormatter;
    } else {
      var displayName = cmd.displayName || colId;
      ci.name = he.encode(displayName);
      ci.toolTip = he.encode(displayName);
      ci.sortable = true;
      const ff = viewParams.getColumnFormatter(schema, colId);
      ci.formatter = (
        row: any,
        cell: any,
        value: any,
        columnDef: any,
        item: any
      ) => (ff as any)(value);
    }
    ci.width = colWidths[colId];
    slickColMap[colId] = ci;
  }
  return slickColMap;
};

/**
 * React component wrapper around SlickGrid
 *
 */
export interface GridPaneProps {
  appState: AppState;
  viewState: ViewState;
  stateRef: StateRef<AppState>;
  onSlickGridCreated: (grid: any) => void;
}

/* Create grid from the specified set of columns */
const createGrid = (
  stateRef: StateRef<AppState>,
  viewStateRef: MutableRefObject<ViewState>,
  columns: any,
  data: any
) => {
  let grid = new Slick.Grid(container, data, columns, gridOptions);

  const selectionModel = new CellSelectionModel();
  grid.setSelectionModel(selectionModel);
  selectionModel.onSelectedRangesChanged.subscribe((e: any, args: any) => {
    // TODO: could store this in app state and show some
    // stats about selected range
  });

  const copyManager = new CellCopyManager();
  grid.registerPlugin(copyManager);

  copyManager.onCopyCells.subscribe(async (e: any, args: any) => {
    const range = args.ranges[0];
    let copyData = [];
    const gridCols = grid.getColumns();
    const gridData = grid.getData();
    for (let row = range.fromRow; row <= range.toRow; row++) {
      const rowData = gridData.getItem(row);
      const copyRow = [];
      for (let col = range.fromCell; col <= range.toCell; col++) {
        const cid = gridCols[col].id;
        copyRow.push(rowData[cid]);
      }
      copyData.push(copyRow);
    }
    try {
      // const data = await csv.writeToString(copyData, { headers: false });
      const csvExporter = new ExportToCsv();
      const data = csvExporter.generateCsv(copyData, true);
    } catch (err) {
      console.error("error converting copied data to CSV: ", err);
      return;
    }
    // TODO:
    // clipboard.writeText(data);
  });

  const rangeSelector = new CellRangeSelector();

  grid.registerPlugin(rangeSelector);

  const updateViewportDebounced = _.debounce(() => {
    const vp = grid.getViewport();
    actions.updateViewport(vp.top, vp.bottom, stateRef);
  }, 100);

  grid.onViewportChanged.subscribe((e: any, args: any) => {
    updateViewportDebounced();
  });

  grid.onSort.subscribe((e: any, args: any) => {
    console.log("grid onSort: ", args);
    // convert back from slickGrid format: */
    const sortKey = args.sortCols.map((sc: any) => [
      sc.sortCol.field,
      sc.sortAsc,
    ]);
    actions.setSortKey(sortKey, stateRef);
  });

  const onGridClick = (e: any, args: any) => {
    log.info("onGridClick: ", e, args);
    const viewState = viewStateRef.current;
    const viewParams = viewState.viewParams;
    var item = grid.getDataItem(args.row);
    log.info("onGridClick: item: ", item);
    if (item._isLeaf) {
      return;
    }
    const vpivots = viewParams.vpivots;
    const depth = item._depth;
    let path = [];
    for (let i = 0; i < vpivots.length && i < depth; i++) {
      let pathItem = item["_path" + i];
      path.push(item["_path" + i]);
    }
    log.info("onGridClick: path: ", path);
    if (item._isOpen) {
      actions.closePath(path, stateRef);
    } else {
      actions.openPath(path, stateRef);
    }
  };

  grid.onClick.subscribe(onGridClick);

  grid.onColumnsReordered.subscribe((e: any, args: any) => {
    const cols = grid.getColumns();
    const displayColIds = cols
      .map((c: any) => c.field)
      .filter((cid: any) => cid[0] !== "_");
    actions.setColumnOrder(displayColIds, stateRef);
  });

  // load the first page
  grid.onViewportChanged.notify();

  return grid;
};

const isPivoted = (viewState: ViewState) => {
  const viewParams = viewState.viewParams;
  return viewParams.vpivots.length > 0;
};

interface GridState {
  grid: any;
  colWidthsMap: ColWidthMap | null;
  slickColMap: any;
}

const updateColWidth = (
  gs: GridState,
  dataView: PagedDataView,
  colId: string
) => {
  const colWidth = getColWidth(dataView, colId);
  gs.colWidthsMap![colId] = colWidth;
  gs.slickColMap[colId].width = colWidth;
};

// Get grid columns based on current column visibility settings:
const getGridCols = (gs: GridState, viewState: ViewState) => {
  const { viewParams, dataView } = viewState;
  const showHiddenCols = viewParams.showHiddenCols;
  const displayCols = viewParams.displayColumns;

  let gridCols = displayCols.map((cid) => gs.slickColMap[cid]);
  if (isPivoted(viewState)) {
    updateColWidth(gs, dataView!, "_pivot");
    let pivotCol = gs.slickColMap["_pivot"];
    gridCols.unshift(pivotCol);
  }
  if (showHiddenCols) {
    const hiddenColIds = _.difference(
      _.keys(gs.slickColMap),
      gridCols.map((gc) => gc.field)
    );
    const hiddenCols = hiddenColIds.map((cid) => gs.slickColMap[cid]);
    gridCols = gridCols.concat(hiddenCols);
  }
  return gridCols;
};

/*
 * update grid from dataView
 */
const updateGrid = (gs: GridState, viewState: ViewState) => {
  const { viewParams, dataView } = viewState;
  if (dataView == null) return;
  console.log(
    "updateGrid: dataView: offset: ",
    dataView.getOffset(),
    "length: ",
    dataView.getLength()
  );
  gs.slickColMap = mkSlickColMap(dataView.schema, viewParams, gs.colWidthsMap!);
  const gridCols = getGridCols(gs, viewState);

  const grid = gs.grid;

  // In pre-Hooks version, we wouldn't do this on first render (grid creation).
  // May want or need to optimize for that case.
  grid.setColumns(gridCols);
  grid.setData(dataView);

  // update sort columns:
  const vpSortKey = viewParams.sortKey.map(([columnId, sortAsc]) => ({
    columnId,
    sortAsc,
  }));
  grid.setSortColumns(vpSortKey);
  grid.invalidateAllRows();
  grid.updateRowCount();
  grid.render();
};

const createGridState = (
  stateRef: StateRef<AppState>,
  viewStateRef: MutableRefObject<ViewState>
): GridState => {
  const { viewParams, dataView } = viewStateRef.current;
  const colWidthsMap = getInitialColWidthsMap(dataView!);
  const slickColMap = mkSlickColMap(dataView!.schema, viewParams, colWidthsMap);
  const gs = { grid: null, colWidthsMap, slickColMap };

  const gridCols = getGridCols(gs, viewStateRef.current);
  gs.grid = createGrid(stateRef, viewStateRef, gridCols, dataView);
  return gs;
};

const RawGridPane: React.FunctionComponent<GridPaneProps> = ({
  appState,
  viewState,
  stateRef,
  onSlickGridCreated,
}) => {
  const [gridState, setGridState] = useState<GridState | null>(null);
  const [prevDataView, setPrevDataView] = useState<PagedDataView | null>(null);
  const viewStateRef = useRef<ViewState>(viewState);

  viewStateRef.current = viewState;
  log.debug("RawGridPane: ", appState.toJS(), viewState.toJS());

  React.useEffect(() => {
    let gs = gridState;
    const dataView = viewState.dataView;
    if (gs === null) {
      gs = createGridState(stateRef, viewStateRef);
      if (onSlickGridCreated) {
        onSlickGridCreated(gs.grid);
      }
      gs.grid.resizeCanvas();
      setGridState(gs);
    }
    log.debug("GridPane effect: ", prevDataView, dataView);
    if (dataView !== prevDataView && dataView != null) {
      log.debug("RawGridPane: updating grid");
      updateGrid(gs, viewStateRef.current);
      setPrevDataView(dataView);
    } else {
      log.debug("RawGridPane: no view change, skipping grid update");
    }
  });

  const handleWindowResize = (e: any) => {
    if (gridState) {
      /*
      const $container = $(container)
      console.log('$container: ', $container)
      const pvh = $.css($container[0], 'height', true)
      console.log('viewport height before resize:', pvh)
      */
      gridState.grid.resizeCanvas();
      /*
      console.log('viewport height after resize:', $.css($container[0], 'height', true))
      console.log('gridPane.handleWindowResize: done with resize and render')
      */
    }
  };

  const lt = viewState.loadingTimer;
  // Only show loading modal if we've been loading more than 500 ms
  const lm = lt.running && lt.elapsed > 500 ? <LoadingModal /> : null;
  return (
    <div className="gridPaneOuter">
      <WindowSizeListener onResize={handleWindowResize} />
      <div className="gridPaneInner">
        <div id="epGrid" className="slickgrid-container full-height" />
      </div>
      {lm}
    </div>
  );
};

const shouldGridPaneUpdate = (oldProps: any, nextProps: any): boolean => {
  const viewState = oldProps.viewState;
  const nextViewState = nextProps.viewState;
  const omitPred = (val: any, key: string, obj: Object) =>
    key.startsWith("viewport");
  // N.B.: We use toObject rather than toJS because we only want a
  // shallow conversion
  const vs = _.omitBy(viewState.toObject(), omitPred);
  const nvs = _.omitBy(nextViewState.toObject(), omitPred);
  const ret = util.shallowEqual(vs, nvs);
  return ret;
};

export const GridPane = React.memo(RawGridPane, shouldGridPaneUpdate);
