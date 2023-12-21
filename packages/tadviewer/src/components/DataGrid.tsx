/**
 *
 * A DataGrid component, implemented using SlickGrid.
 *
 * This is a refactor of the original GridPane that decouples SlickGrid from Tad. The goal is to define a virtual DataGrid React
 * component that does not have any Tad or SlickGrid details in the
 */
// for debugging resize handler:
// import $ from 'jquery'
import * as React from "react";
import _ from "lodash";

/* /// <reference path="slickgrid-es6.d.ts"> */
import * as SlickGrid from "slickgrid-es6";
import * as reltab from "reltab";
import { LoadingModal } from "./LoadingModal";
import { SimpleClipboard } from "./SimpleClipboard";
import { DataRow, PagedDataView } from "../PagedDataView";
import * as he from "he";
import { useState, useRef } from "react";
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
import { CellFormatter } from "../FormatOptions";

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
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter,
  dataView: PagedDataView,
  cnm: string
) => {
  const { schema } = dataView;
  let sf: (val: any) => string;
  if (schema.columnIndex(cnm)) {
    const cf = getColumnFormatter(schema, cnm);
    sf = (val: any) => cf(val) ?? val.toString();
  } else {
    sf = (val: any) => val.toString();
  }
  let colWidth;
  const offset = dataView.getOffset();
  const limit = offset + dataView.getItemCount();
  for (var i = offset; i < limit; i++) {
    var row = dataView.getItem(i);
    var cellVal = row![cnm];
    var cellWidth = MINCOLWIDTH;
    if (cellVal) {
      cellWidth = measureStringWidth(sf(cellVal));
    }
    if (cnm === "_pivot") {
      cellWidth += calcIndent(row!._depth + 2);
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
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter,
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
    colWidths[cnm] = getColWidth(getColumnFormatter, dataView, cnm);
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
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter,
  getColumnCssClassName: (schema: reltab.Schema, cid: string) => string | null,
  pivotColumnDisplayName: string,
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
      ci.cssClass = "pivot-column";
      ci.name = he.encode(pivotColumnDisplayName);
      ci.toolTip = he.encode(pivotColumnDisplayName);
      ci.formatter = groupCellFormatter;
    } else {
      var displayName = cmd.displayName || colId;
      ci.name = he.encode(displayName);
      ci.toolTip = he.encode(displayName);
      ci.sortable = true;
      const ff = getColumnFormatter(schema, colId);
      const cellClass = getColumnCssClassName(schema, colId);
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
  onHistogramBrushRange?: (
    colId: string,
    range: [number, number] | null
  ) => void;
  onHistogramBrushFilter?: (
    colId: string,
    range: [number, number] | null
  ) => void;
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
  colType,
  histData,
  onHistogramBrushRange,
  onHistogramBrushFilter,
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
    onHistogramBrushRange?.(colId, brushInfo.x);
  };
  const handleBrushEnd = (brushInfo: any) => {
    let [minVal, maxVal] = brushInfo.x;
    if (colType.kind === "integer") {
      minVal = Math.round(minVal);
      maxVal = Math.round(maxVal);
    } else {
      minVal = round(minVal, 2);
      maxVal = round(maxVal, 2);
    }
    onHistogramBrushFilter?.(colId, [minVal, maxVal]);
  };

  return (
    <VictoryChart
      padding={60}
      domain={{ x: [niceMinVal, niceMaxVal + binWidth * 2] }}
      containerComponent={
        <VictoryBrushContainer
          responsive={true}
          brushDimension="x"
          brushDomain={{ x: [brushMinVal, brushMaxVal] }}
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

const getGridOptions = ({ showColumnHistograms, histoMap }: DataGridProps) => {
  const histoCount = histoMap ? Object.keys(histoMap).length : 0;

  const showHeaderRow = showColumnHistograms && histoCount > 0;
  const gridOptions = {
    ...baseGridOptions,
    showHeaderRow,
  };
  return gridOptions;
};

// escape tabs by placing string in quotes
function escapeTabs(cellData: any): any {
  if (typeof cellData === "string" && cellData.indexOf("\t") >= 0) {
    return '"' + cellData.replace(/"/g, '""') + '"';
  }
  return cellData;
}

/* Create grid from the specified set of columns */
const createGrid = (
  containerId: string,
  columns: any,
  dataView: any,
  props: DataGridProps
) => {
  const {
    histoMap,
    onViewportChanged,
    onHistogramBrushRange,
    onHistogramBrushFilter,
    onSetSortKey,
    onGridClick,
    onSetColumnOrder,
    sortKey,
    clipboard,
    openURL,
    embedded,
  } = props;

  const gridOptions = getGridOptions(props);
  let grid = new Slick.Grid(`#${containerId}`, dataView, columns, gridOptions);

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
    let copyRowStrings: string[] = [];
    const gridCols = grid.getColumns();
    const gridData = grid.getData();
    for (let row = range.fromRow; row <= range.toRow; row++) {
      const rowData = gridData.getItem(row);
      const copyRow = [];
      for (let col = range.fromCell; col <= range.toCell; col++) {
        const cid = gridCols[col].id;
        copyRow.push(escapeTabs(rowData[cid]));
      }
      copyRowStrings.push(copyRow.join("\t"));
    }
    const copyData = copyRowStrings.join("\r\n") + "\r\n";
    clipboard.writeText(copyData);
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
    onViewportChanged?.(vp.top, vp.bottom);
  }, 100);

  grid.onViewportChanged.subscribe((e: any, args: any) => {
    updateViewportDebounced();
  });

  grid.onHeaderRowCellRendered.subscribe((e: any, { node, column }: any) => {
    console.log("onHeaderRowCellRendered: ", column);
    if (dataView && histoMap && histoMap[column.id]) {
      const histo = histoMap[column.id];
      const colType = dataView.schema.columnType(column.id);
      const root = ReactDOM.createRoot(node);
      root.render(
        <NumericColumnHistogram
          histData={histo}
          colType={colType}
          onHistogramBrushRange={onHistogramBrushRange}
          onHistogramBrushFilter={onHistogramBrushFilter}
        />
      );
      node.classList.add("slick-editable");
    } else {
      console.log("*** no histo for column: ", column.id);
    }
  });

  grid.onSort.subscribe((e: any, args: any) => {
    // console.log("grid onSort: ", args);
    // convert back from slickGrid format: */
    const sortKey = args.sortCols.map((sc: any) => [
      sc.sortCol.field,
      sc.sortAsc,
    ]);
    onSetSortKey?.(sortKey);
  });

  const handleGridClick = (e: any, args: any) => {
    // log.info("onGridClick: ", e, args);
    const columns = grid.getColumns();
    const col = columns[args.cell];
    // log.info("onGridClick: column: ", col);
    var item = grid.getDataItem(args.row);

    onGridClick?.(args.row, args.cell, item, col.id, item[col.id]);
  };

  grid.onClick.subscribe(handleGridClick);

  grid.onColumnsReordered.subscribe((e: any, args: any) => {
    const cols = grid.getColumns();
    const displayColIds = cols
      .map((c: any) => c.field)
      .filter((cid: any) => cid[0] !== "_");
    onSetColumnOrder?.(displayColIds);
  });

  // load the first page
  grid.onViewportChanged.notify();

  return grid;
};

interface GridState {
  grid: any;
  colWidthsMap: ColWidthMap | null;
  slickColMap: any;
  containerId: string;
}

const updateColWidth = (
  gs: GridState,
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter,
  dataView: PagedDataView,
  colId: string
) => {
  const colWidth = getColWidth(getColumnFormatter, dataView, colId);
  gs.colWidthsMap![colId] = colWidth;
  gs.slickColMap[colId].width = colWidth;
};

// Get grid columns based on current column visibility settings:
const getGridCols = (
  gs: GridState,
  isPivoted: boolean,
  showHiddenColumns: boolean,
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter,
  dataView: PagedDataView,
  displayColumns: string[]
) => {
  let gridCols = displayColumns.map((cid) => gs.slickColMap[cid]);
  if (isPivoted) {
    updateColWidth(gs, getColumnFormatter, dataView!, "_pivot");
    let pivotCol = gs.slickColMap["_pivot"];
    gridCols.unshift(pivotCol);
  }
  if (showHiddenColumns) {
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
const updateGrid = (gs: GridState, props: DataGridProps) => {
  const {
    dataView,
    getColumnFormatter,
    getColumnCssClassName,
    isPivoted,
    showHiddenColumns,
    displayColumns,
    pivotColumnDisplayName,
    sortKey,
  } = props;

  gs.slickColMap = mkSlickColMap(
    dataView!.schema,
    getColumnFormatter,
    getColumnCssClassName,
    pivotColumnDisplayName ?? "",
    gs.colWidthsMap!
  );
  const gridCols = getGridCols(
    gs,
    isPivoted!,
    showHiddenColumns,
    getColumnFormatter,
    dataView!,
    displayColumns
  );

  const grid = gs.grid;

  const gridOptions = getGridOptions(props);
  // console.log("updateGrid: gridOptions: ", gridOptions);

  grid.setOptions(gridOptions);
  grid.setHeaderRowVisibility(gridOptions.showHeaderRow);

  // In pre-Hooks version, we wouldn't do this on first render (grid creation).
  // May want or need to optimize for that case.
  grid.setColumns(gridCols);
  grid.setData(dataView);

  // update sort columns:
  const vpSortKey = sortKey
    ? sortKey.map(([columnId, sortAsc]) => ({ columnId, sortAsc }))
    : [];
  grid.setSortColumns(vpSortKey);
  grid.invalidateAllRows();
  grid.updateRowCount();
  grid.render();
  grid.resizeCanvas();
};

const createGridState = (
  containerId: string,
  props: DataGridProps
): GridState => {
  const {
    dataView,
    showColumnHistograms,
    histoMap,
    getColumnFormatter,
    getColumnCssClassName,
    pivotColumnDisplayName,
    showLoadingModal,
    clipboard,
    openURL,
    embedded,
    isPivoted,
    showHiddenColumns,
    displayColumns,
  } = props;

  const colWidthsMap = getInitialColWidthsMap(getColumnFormatter, dataView!);
  const slickColMap = mkSlickColMap(
    dataView!.schema,
    getColumnFormatter,
    getColumnCssClassName,
    pivotColumnDisplayName ?? "",
    colWidthsMap
  );
  const gs = { grid: null, colWidthsMap, slickColMap, containerId };

  const gridCols = getGridCols(
    gs,
    isPivoted ?? false,
    showHiddenColumns,
    getColumnFormatter,
    dataView!,
    displayColumns
  );
  gs.grid = createGrid(containerId, gridCols, dataView, props);
  return gs;
};

export interface DataGridProps {
  dataView: PagedDataView | null | undefined;
  showColumnHistograms?: boolean;
  histoMap?: reltab.ColumnHistogramMap;
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter;
  getColumnCssClassName: (schema: reltab.Schema, cid: string) => string | null;
  pivotColumnDisplayName?: string;
  isPivoted?: boolean;
  showHiddenColumns: boolean;
  displayColumns: string[];
  showLoadingModal: boolean;
  clipboard: SimpleClipboard;
  onViewportChanged?: (top: number, bottom: number) => void;
  onHistogramBrushRange?: (
    colId: string,
    range: [number, number] | null
  ) => void;
  onHistogramBrushFilter?: (
    colId: string,
    range: [number, number] | null
  ) => void;
  sortKey?: [string, boolean][];
  onSetSortKey?: (sortKey: [string, boolean][]) => void;
  onGridClick?: (
    row: number,
    column: number,
    dataRow: DataRow,
    columnId: string,
    cellVal: any
  ) => void;
  onSetColumnOrder?: (displayColumns: string[]) => void;
  openURL: OpenURLFn;
  embedded: boolean;
}

export const DataGrid: React.FunctionComponent<DataGridProps> = (
  props: DataGridProps
) => {
  const {
    dataView,
    showColumnHistograms,
    histoMap,
    showLoadingModal,
    clipboard,
    openURL,
    embedded,
  } = props;
  const containerIdRef = useRef(genContainerId());
  const [gridState, setGridState] = useState<GridState | null>(null);

  const prevShowColumnHistograms = useRef(showColumnHistograms);

  React.useLayoutEffect(() => {
    let gs = gridState;
    // The extra check here for prevShowColumnHistograms is a workaround
    // for an apparent bug in SlickGrid where it doesn't seem to re-render
    // correctly when we dynamically change the showHeaderRow option on the grid.
    if (
      gs === null ||
      (prevShowColumnHistograms.current !== showColumnHistograms && histoMap)
    ) {
      // log.debug("RawGridPane: creating grid state");
      gs = createGridState(containerIdRef.current, props);
      gs.grid.resizeCanvas();
      setGridState(gs);
      // log.debug("RawGridPane: done creating grid state");
      prevShowColumnHistograms.current = showColumnHistograms;
    }
    if (dataView != null) {
      // log.debug("RawGridPane: updating grid");
      updateGrid(gs, props);
    } else {
      // log.debug("RawGridPane: no view change, skipping grid update");
    }
  }, [dataView, gridState, showColumnHistograms]);

  const handleGridResize = () => {
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

  const lm = showLoadingModal ? <LoadingModal /> : null;

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
