// for debugging resize handler:
// import $ from 'jquery'
import * as React from "react";
import _, { cloneDeep, CurriedFunction1 } from "lodash";

/* /// <reference path="slickgrid-es6.d.ts"> */
import * as SlickGrid from "slickgrid-es6";
import * as reltab from "reltab";
import * as actions from "../actions";
import { LoadingModal } from "./LoadingModal";
import { SimpleClipboard } from "./SimpleClipboard";
import { PagedDataView } from "../PagedDataView";
import { ViewParams } from "../ViewParams";
import * as util from "../util";
import { ExportToCsv } from "export-to-csv";
import * as he from "he";
import { AppState } from "../AppState";
import { ViewState } from "../ViewState";
import { mutableGet, StateRef } from "oneref";
import { useState, useRef, MutableRefObject } from "react";
import log from "loglevel";

const { Slick } = SlickGrid;
const { Plugins } = SlickGrid as any;
const { CellRangeSelector, CellSelectionModel, CellCopyManager, AutoTooltips } =
  Plugins;
import { ResizeEntry, ResizeSensor } from "@blueprintjs/core";
import { ColumnType, NumericColumnHistogramData, Schema } from "reltab";
import ReactDOM from "react-dom/client";
import {
  VictoryAxis,
  VictoryBar,
  VictoryBrushContainer,
  VictoryChart,
  VictoryTheme,
} from "victory";

export type OpenURLFn = (url: string) => void;

let divCounter = 0;

const genContainerId = (): string => `epGrid${divCounter++}`;

const baseGridOptions = {
  multiColumnSort: true,
  headerRowHeight: 80,
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
const MINCOLWIDTH = 150;
const MAXCOLWIDTH = 300;

// TODO: use real font metrics:
const measureStringWidth = (s: string): number => 8 + 5.5 * s.length;
const measureHeaderStringWidth = (s: string): number => 24 + 5.5 * s.length;

// get column width for specific column:
const getColWidth = (
  viewParams: ViewParams,
  schema: Schema,
  dataView: PagedDataView,
  cnm: string
) => {
  let sf: (val: any) => string;
  if (schema.columnIndex(cnm)) {
    const cf = viewParams.getColumnFormatter(schema, cnm);
    sf = (val: any) => cf(val) ?? val.toString();
  } else {
    sf = (val: any) => val.toString();
  }
  let colWidth;
  const offset = dataView.getOffset();
  const limit = offset + dataView.getItemCount();
  for (var i = offset; i < limit; i++) {
    var row = dataView.getItem(i);
    var cellVal = row[cnm];
    var cellWidth = MINCOLWIDTH;
    if (cellVal) {
      cellWidth = measureStringWidth(sf(cellVal));
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

function getInitialColWidthsMap(
  viewParams: ViewParams,
  schema: Schema,
  dataView: PagedDataView
): ColWidthMap {
  // let's approximate the column width:
  var colWidths: ColWidthMap = {};
  var nRows = dataView.getLength();
  if (nRows === 0) {
    return {};
  }
  const initRow = dataView.getItem(0);
  for (let cnm in initRow) {
    colWidths[cnm] = getColWidth(viewParams, schema, dataView, cnm);
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
      const cellClass = viewParams.getColumnClassName(schema, colId);
      if (cellClass != null) {
        ci.cssClass = cellClass;
      }
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

interface NumericColumnHistogramProps {
  histData: NumericColumnHistogramData;
  colType: ColumnType;
  stateRef: StateRef<AppState>;
}

// gross hack to round to two decimal places:
function round(value: number, decimals: number): number {
  return Number(
    Math.round(Number(value.toString() + "e" + decimals.toString())) +
      "e-" +
      decimals
  );
}
const NumericColumnHistogram = ({
  stateRef,
  colType,
  histData,
}: NumericColumnHistogramProps) => {
  const {
    colId,
    binWidth,
    niceMinVal,
    niceMaxVal,
    binData,
    brushMinVal,
    brushMaxVal,
  } = histData;
  const [brushRange, setBrushRange] = useState([brushMinVal, brushMaxVal]);
  const chartData = binData.map((count: number, binIndex: number) => ({
    binMid: niceMinVal + (binIndex + 0.5) * binWidth,
    count,
  }));
  const fmtOpts = {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: true,
  };

  const handleBrush = (brushInfo: any) => {
    console.log("**** handleBrush: ", brushInfo.x);
    setBrushRange(brushInfo.x);
  };
  const handleBrushEnd = (brushInfo: any) => {
    const [minVal, maxVal] = brushInfo.x;
    const filterMinVal =
      colType.kind === "integer" ? Math.round(minVal) : round(minVal, 2);
    const filterMaxVal =
      colType.kind === "integer" ? Math.round(maxVal) : round(maxVal, 2);
    console.log(
      "*** handleBrushEnd: ",
      minVal,
      maxVal,
      filterMinVal,
      filterMaxVal
    );
    actions.setHistogramBrushFilter(
      colId,
      [minVal, maxVal],
      [filterMinVal, filterMaxVal],
      stateRef
    );
  };

  console.log(`rendering brush with range:, [${brushMinVal}, ${brushMaxVal}]`);
  return (
    <VictoryChart
      padding={60}
      domain={{ x: [niceMinVal, niceMaxVal + binWidth * 2] }}
      containerComponent={
        <VictoryBrushContainer
          responsive={true}
          brushDimension="x"
          brushDomain={{ x: [brushRange[0], brushRange[1]] }}
          onBrushDomainChange={handleBrush}
          onBrushDomainChangeEnd={handleBrushEnd}
        />
      }
    >
      <VictoryAxis
        tickValues={[niceMinVal, niceMaxVal]}
        tickFormat={(tick: number) => tick.toLocaleString(undefined, fmtOpts)}
        style={{
          axis: { stroke: "none" },
          tickLabels: { fontSize: 40 },
        }}
      />
      <VictoryAxis
        dependentAxis
        tickCount={2}
        style={{
          axis: { stroke: "none" },
          tickLabels: { fontSize: 40 },
        }}
      />
      <VictoryBar
        style={{ data: { fill: "rgb(25, 118, 210)" } }}
        data={chartData}
        x="binMid"
        y="count"
      />
    </VictoryChart>
  );
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
  clipboard: SimpleClipboard;
  openURL: OpenURLFn;
  embedded: boolean;
}

const getGridOptions = (
  showColumnHistograms: boolean,
  viewState: ViewState
) => {
  const { queryView } = viewState;
  const histoCount = queryView?.histoMap
    ? Object.keys(queryView.histoMap).length
    : 0;

  const showHeaderRow = showColumnHistograms && histoCount > 0;
  const gridOptions = {
    ...baseGridOptions,
    showHeaderRow,
  };
  return gridOptions;
};

const getGridOptionsFromStateRef = (stateRef: StateRef<AppState>) => {
  const appState = mutableGet(stateRef);

  return getGridOptions(appState.showColumnHistograms, appState.viewState);
};

/* Create grid from the specified set of columns */
const createGrid = (
  stateRef: StateRef<AppState>,
  containerId: string,
  viewStateRef: MutableRefObject<ViewState>,
  columns: any,
  data: any,
  clipboard: SimpleClipboard,
  openURL: (url: string) => void,
  embedded: boolean
) => {
  const gridOptions = getGridOptionsFromStateRef(stateRef);
  let grid = new Slick.Grid(`#${containerId}`, data, columns, gridOptions);

  const selectionModel = new CellSelectionModel();
  grid.setSelectionModel(selectionModel);
  selectionModel.onSelectedRangesChanged.subscribe((e: any, args: any) => {
    // TODO: could store this in app state and show some
    // stats about selected range
  });

  const copyManager = new CellCopyManager();
  grid.registerPlugin(copyManager);
  grid.registerPlugin(new AutoTooltips({ enableForCells: true }));

  const copySelectedRange = async (range: any) => {
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
      console.log("writing text to clipboard: ", data);
      clipboard.writeText(data);
    } catch (err) {
      console.error("error converting copied data to CSV: ", err);
      return;
    }
  };

  copyManager.onCopyCells.subscribe(async (e: any, args: any) => {
    const range = args.ranges[0];
    copySelectedRange(range);
  });

  // gross hack, but makes copy menu item work in Electron:
  if (!embedded) {
    document.addEventListener("copy", function (e) {
      const ranges = grid.getSelectionModel().getSelectedRanges();
      if (ranges && ranges.length != 0) {
        copySelectedRange(ranges[0]);
      }
    });
  }
  const rangeSelector = new CellRangeSelector();

  grid.registerPlugin(rangeSelector);

  const updateViewportDebounced = _.debounce(() => {
    const vp = grid.getViewport();
    actions.updateViewport(vp.top, vp.bottom, stateRef);
  }, 100);

  grid.onViewportChanged.subscribe((e: any, args: any) => {
    updateViewportDebounced();
  });

  grid.onHeaderRowCellRendered.subscribe((e: any, { node, column }: any) => {
    const appState = mutableGet(stateRef);
    const viewState = appState.viewState;
    const { queryView } = viewState;
    if (queryView && queryView.histoMap && queryView.histoMap[column.id]) {
      const histo = queryView.histoMap[column.id];
      const colType = viewState.baseSchema.columnType(column.id);
      const root = ReactDOM.createRoot(node);
      root.render(
        <NumericColumnHistogram
          histData={histo}
          colType={colType}
          stateRef={stateRef}
        />
      );
      node.classList.add("slick-editable");
    }
  });

  grid.onSort.subscribe((e: any, args: any) => {
    // console.log("grid onSort: ", args);
    // convert back from slickGrid format: */
    const sortKey = args.sortCols.map((sc: any) => [
      sc.sortCol.field,
      sc.sortAsc,
    ]);
    actions.setSortKey(sortKey, stateRef);
  });

  const onGridClick = (e: any, args: any) => {
    // log.info("onGridClick: ", e, args);
    const viewState = viewStateRef.current;
    const viewParams = viewState.viewParams;
    const columns = grid.getColumns();
    const col = columns[args.cell];
    // log.info("onGridClick: column: ", col);
    var item = grid.getDataItem(args.row);
    // log.info("onGridClick: item: ", item);

    if (col.id === "_pivot") {
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
      // log.info("onGridClick: path: ", path);
      if (item._isOpen) {
        actions.closePath(path, stateRef);
      } else {
        actions.openPath(path, stateRef);
      }
    } else {
      const dataView: PagedDataView = grid.getData();
      if (dataView.schema.columnIndex(col.id)) {
        const ch = viewParams.getClickHandler(dataView.schema, col.id);
        ch({ openURL }, args.row, args.cell, item[col.id]);
      }
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
  containerId: string;
}

const updateColWidth = (
  gs: GridState,
  viewParams: ViewParams,
  schema: Schema,
  dataView: PagedDataView,
  colId: string
) => {
  const colWidth = getColWidth(viewParams, schema, dataView, colId);
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
    updateColWidth(gs, viewParams, dataView!.schema, dataView!, "_pivot");
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
const updateGrid = (
  gs: GridState,
  viewState: ViewState,
  showColumnHistograms: boolean
) => {
  const { viewParams, dataView } = viewState;
  if (dataView == null) return;

  gs.slickColMap = mkSlickColMap(dataView.schema, viewParams, gs.colWidthsMap!);
  const gridCols = getGridCols(gs, viewState);

  const grid = gs.grid;

  const gridOptions = getGridOptions(showColumnHistograms, viewState);

  grid.setOptions(gridOptions);
  grid.setHeaderRowVisibility(gridOptions.showHeaderRow);

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
  viewStateRef: MutableRefObject<ViewState>,
  containerId: string,
  clipboard: SimpleClipboard,
  openURL: (url: string) => void,
  embedded: boolean
): GridState => {
  const { viewParams, dataView, baseSchema } = viewStateRef.current;
  const colWidthsMap = getInitialColWidthsMap(
    viewParams,
    dataView!.schema,
    dataView!
  );
  const slickColMap = mkSlickColMap(dataView!.schema, viewParams, colWidthsMap);
  const gs = { grid: null, colWidthsMap, slickColMap, containerId };

  const gridCols = getGridCols(gs, viewStateRef.current);
  gs.grid = createGrid(
    stateRef,
    containerId,
    viewStateRef,
    gridCols,
    dataView,
    clipboard,
    openURL,
    embedded
  );
  return gs;
};

const RawGridPane: React.FunctionComponent<GridPaneProps> = ({
  appState,
  viewState,
  stateRef,
  onSlickGridCreated,
  clipboard,
  openURL,
  embedded,
}) => {
  const containerIdRef = useRef(genContainerId());
  const [gridState, setGridState] = useState<GridState | null>(null);
  const viewStateRef = useRef<ViewState>(viewState);

  const prevShowColumnHistograms = useRef(appState.showColumnHistograms);

  viewStateRef.current = viewState;

  const dataView = viewState.dataView;

  const { showColumnHistograms } = appState;

  // log.debug("RawGridPane: ", appState.toJS(), viewState.toJS());

  React.useLayoutEffect(() => {
    let gs = gridState;
    // The extra check here for prevShowColumnHistograms is a workaround
    // for an apparent bug in SlickGrid where it doesn't seem to re-render
    // correctly when we dynamically change the showHeaderRow option on the grid.
    if (
      gs === null ||
      prevShowColumnHistograms.current !== showColumnHistograms
    ) {
      gs = createGridState(
        stateRef,
        viewStateRef,
        containerIdRef.current,
        clipboard,
        openURL,
        embedded
      );
      if (onSlickGridCreated) {
        onSlickGridCreated(gs.grid);
      }
      gs.grid.resizeCanvas();
      setGridState(gs);
    }
    // log.debug("GridPane effect: ", prevDataView, dataView);
    if (dataView != null) {
      // log.debug("RawGridPane: updating grid");
      updateGrid(gs, viewStateRef.current, showColumnHistograms);
    } else {
      // log.debug("RawGridPane: no view change, skipping grid update");
    }
    prevShowColumnHistograms.current = showColumnHistograms;
  }, [dataView, gridState, showColumnHistograms]);

  const handleGridResize = (entries: ResizeEntry[]) => {
    // TODO: debounce?
    if (gridState) {
      gridState.grid.resizeCanvas();
    }
  };

  const handleWindowResize = (e: any) => {
    // console.log("handleWindowResize: ", e);
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
      <div className="gridPaneInner">
        <ResizeSensor onResize={handleGridResize}>
          <div
            id={containerIdRef.current}
            className="slickgrid-container full-height"
          />
        </ResizeSensor>
      </div>
      {lm}
    </div>
  );
};

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

export const GridPane = React.memo(RawGridPane, gridPanePropsEqual);
