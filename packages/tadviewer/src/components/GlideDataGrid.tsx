/**
 * SPIKE: A DataGrid implementation using Glide Data Grid
 * (https://github.com/glideapps/glide-data-grid) instead of SlickGrid.
 *
 * Implements the same DataGridProps interface as the SlickGrid-based DataGrid,
 * so that GridPane can use either one. Enable with TAD_GRID=glide (Electron)
 * or localStorage.tadGrid = "glide" (web).
 *
 * Not yet implemented here: tooltips / ellipsis for clipped text, column
 * histograms, the Electron Edit > Copy menu path, and replacing the HTML
 * produced by the cell formatters with a plain text formatter API.
 */
import {
  CellClickedEventArgs,
  CompactSelection,
  CustomCell,
  CustomRenderer,
  DataEditor,
  DataEditorRef,
  getMiddleCenterBias,
  GridCell,
  GridCellKind,
  GridColumn,
  GridSelection,
  HeaderClickedEventArgs,
  Item,
  Rectangle,
  Theme,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import * as he from "he";
import _ from "lodash";
import * as React from "react";
import { DataRow } from "../PagedDataView";
import { DataGridProps, getColWidth } from "./DataGrid";
import { LoadingModal } from "./LoadingModal";

// Match the fonts / metrics of Tad's SlickGrid theme:
const FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const gridTheme: Partial<Theme> = {
  fontFamily: FONT_FAMILY,
  baseFontStyle: "11px",
  headerFontStyle: "600 11px",
  editorFontSize: "11px",
  cellHorizontalPadding: 6,
};
const aggregateRowTheme: Partial<Theme> = { baseFontStyle: "600 11px" };
const linkTheme: Partial<Theme> = { textDark: "#2965cc" };
const ROW_HEIGHT = 25;
const HEADER_HEIGHT = 28;

/*
 * Testing hook: with TAD_TEST_HOOKS=1 in the environment (Electron), expose
 * the grid's geometry as window.__tadGrid, so that UI tests can click cells
 * and scroll without computing pixel positions. See tad-app/e2e.
 */
const testHooksEnabled: boolean = (() => {
  try {
    return (
      typeof process !== "undefined" && process.env?.TAD_TEST_HOOKS === "1"
    );
  } catch (e) {
    return false;
  }
})();

export interface GridTestHooks {
  // Bounds of a cell in client (CSS pixel) coordinates; row -1 is the header:
  getBounds: (col: number, row: number) => Rectangle | undefined;
  scrollTo: (col: number, row: number) => void;
  columnIds: string[];
  rowCount: number;
}

/*
 * The pivot (tree) column.
 *
 * Tad's pivot tree is flattened by the query layer (aggtree): each row has
 * _depth, _isOpen and _isLeaf, so the tree column is just a custom cell that
 * indents by depth and draws a disclosure triangle. Clicking anywhere in the
 * cell of a non-leaf row opens / closes it (via onGridClick, as with SlickGrid).
 */
interface PivotCellData {
  readonly kind: "tad-pivot-cell";
  readonly text: string;
  readonly depth: number;
  readonly isOpen: boolean;
  readonly canOpen: boolean;
}
type PivotCell = CustomCell<PivotCellData>;

const INDENT_PER_LEVEL = 15; // pixels, same as SlickGrid DataGrid
const TOGGLE_WIDTH = 14;

const pivotCellRenderer: CustomRenderer<PivotCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c: CustomCell): c is PivotCell =>
    (c.data as any).kind === "tad-pivot-cell",
  draw: (args, cell) => {
    const { ctx, theme, rect } = args;
    const { x, y, height: h } = rect;
    const { canOpen, depth, text, isOpen } = cell.data;
    ctx.font = theme.baseFontFull;
    const bias = getMiddleCenterBias(ctx, theme);
    const left = x + theme.cellHorizontalPadding + depth * INDENT_PER_LEVEL;
    const midLine = y + h / 2;
    if (canOpen) {
      ctx.beginPath();
      if (isOpen) {
        ctx.moveTo(left, midLine - 2.5);
        ctx.lineTo(left + 4.5, midLine + 2.5);
        ctx.lineTo(left + 9, midLine - 2.5);
      } else {
        ctx.moveTo(left + 2.5, midLine - 4.5);
        ctx.lineTo(left + 7, midLine);
        ctx.lineTo(left + 2.5, midLine + 4.5);
      }
      ctx.strokeStyle = theme.textMedium;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = theme.textDark;
    ctx.fillText(text, left + TOGGLE_WIDTH, midLine + bias);
    return true;
  },
  provideEditor: undefined,
};
const customRenderers = [pivotCellRenderer];

/*
 * The existing cell formatters (FormatOptions) produce HTML for SlickGrid
 * (HTML-escaped text, or an <a> element for URLs). For this spike, convert
 * that back to plain text; a real migration would change the formatter API.
 */
const htmlToText = (html: string): string =>
  he.decode(html.replace(/<[^>]*>/g, ""));

const rawCopyText = (val: any): string => {
  if (val == null) {
    return "";
  }
  if (typeof val === "object") {
    return JSON.stringify(val, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v
    );
  }
  return String(val);
};

interface ColumnInfo {
  formatter: (val: any) => string | null | undefined;
  isNumeric: boolean;
}

const loadingCell: GridCell = {
  kind: GridCellKind.Loading,
  allowOverlay: false,
};

export const GlideDataGrid: React.FunctionComponent<DataGridProps> = (
  props: DataGridProps
) => {
  const {
    dataView,
    getColumnFormatter,
    getColumnCssClassName,
    pivotColumnDisplayName,
    isPivoted,
    showHiddenColumns,
    displayColumns,
    showLoadingModal,
    onViewportChanged,
    sortKey,
    onSetSortKey,
    onGridClick,
    onGridSelectionChange,
    onSetColumnOrder,
    embedded,
  } = props;

  const schema = dataView?.schema;

  // Column ids, in display order (same rules as the SlickGrid DataGrid):
  const gridColIds: string[] = React.useMemo(() => {
    if (!schema) {
      return [];
    }
    let colIds = [...displayColumns];
    if (isPivoted) {
      colIds.unshift("_pivot");
    }
    if (showHiddenColumns) {
      const allColIds = ["_id", "_parentId", ...schema.columns];
      colIds = colIds.concat(_.difference(allColIds, colIds));
    }
    return colIds;
  }, [schema, displayColumns, isPivoted, showHiddenColumns]);

  // Column widths: estimated from the data (as in DataGrid), unless the
  // user has resized the column.
  const userWidths = React.useRef<{ [cid: string]: number }>({});
  const estWidths = React.useRef<{ [cid: string]: number }>({});
  const columnWidth = (cid: string): number => {
    if (userWidths.current[cid] != null) {
      return userWidths.current[cid];
    }
    if (estWidths.current[cid] == null || cid === "_pivot") {
      estWidths.current[cid] =
        dataView && dataView.getItemCount() > 0
          ? getColWidth(getColumnFormatter, dataView, cid)
          : 120;
    }
    return estWidths.current[cid];
  };
  const [widthsVersion, setWidthsVersion] = React.useState(0);

  const columns: GridColumn[] = React.useMemo(() => {
    if (!schema) {
      return [];
    }
    const sortInfo = new Map<string, [number, boolean]>();
    (sortKey ?? []).forEach(([cid, asc], idx) => sortInfo.set(cid, [idx, asc]));
    const multiSort = (sortKey?.length ?? 0) > 1;
    return gridColIds.map((cid) => {
      let title =
        cid === "_pivot"
          ? pivotColumnDisplayName ?? ""
          : schema.columnIndex(cid) != null
          ? schema.displayName(cid)
          : cid;
      const si = sortInfo.get(cid);
      if (si) {
        const [idx, asc] = si;
        title += (asc ? " ▲" : " ▼") + (multiSort ? `${idx + 1}` : "");
      }
      return { id: cid, title, width: columnWidth(cid) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridColIds, schema, sortKey, pivotColumnDisplayName, dataView, widthsVersion]);

  const columnInfo: { [cid: string]: ColumnInfo } = React.useMemo(() => {
    const ret: { [cid: string]: ColumnInfo } = {};
    if (!schema) {
      return ret;
    }
    for (const cid of gridColIds) {
      if (cid === "_pivot" || schema.columnIndex(cid) == null) {
        ret[cid] = { formatter: (v) => rawCopyText(v), isNumeric: false };
      } else {
        ret[cid] = {
          formatter: getColumnFormatter(schema, cid),
          isNumeric:
            getColumnCssClassName(schema, cid) === "data-cell-numeric",
        };
      }
    }
    return ret;
  }, [schema, gridColIds, getColumnFormatter, getColumnCssClassName]);

  const getCellContent = React.useCallback(
    ([col, row]: Item): GridCell => {
      const item = dataView?.getItem(row);
      const cid = gridColIds[col];
      if (item == null || cid == null) {
        return loadingCell;
      }
      if (cid === "_pivot") {
        const text = item._pivot == null ? "" : String(item._pivot);
        const cell: PivotCell = {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: text,
          cursor: item._isLeaf ? undefined : "pointer",
          data: {
            kind: "tad-pivot-cell",
            text,
            depth: item._depth,
            isOpen: item._isOpen,
            canOpen: !item._isLeaf,
          },
        };
        return cell;
      }
      const val = item[cid];
      const info = columnInfo[cid];
      let displayData = "";
      let isLink = false;
      if (val != null) {
        const fmt = info.formatter(val);
        if (fmt != null) {
          isLink = fmt.startsWith("<a ");
          displayData = htmlToText(fmt);
        }
      }
      return {
        kind: GridCellKind.Text,
        allowOverlay: false,
        readonly: true,
        data: displayData,
        displayData,
        copyData: rawCopyText(val),
        contentAlign: info.isNumeric ? "right" : "left",
        cursor: isLink ? "pointer" : undefined,
        themeOverride: isLink ? linkTheme : undefined,
      };
    },
    [dataView, gridColIds, columnInfo]
  );

  // Bold aggregate (non-leaf) rows, as with SlickGrid's grid-aggregate-row:
  const getRowThemeOverride = React.useCallback(
    (row: number): Partial<Theme> | undefined => {
      const item = dataView?.getItem(row);
      return item && !item._isLeaf ? aggregateRowTheme : undefined;
    },
    [dataView]
  );

  // Lazy loading: report the visible rows, which (via PivotRequester)
  // fetches the pages containing them:
  const onViewportChangedRef = React.useRef(onViewportChanged);
  onViewportChangedRef.current = onViewportChanged;
  const reportViewport = React.useMemo(
    () =>
      _.debounce((top: number, bottom: number) => {
        onViewportChangedRef.current?.(top, bottom);
      }, 100),
    []
  );
  const handleVisibleRegionChanged = React.useCallback(
    (range: Rectangle) => {
      reportViewport(range.y, range.y + range.height);
    },
    [reportViewport]
  );

  const handleCellClicked = React.useCallback(
    ([col, row]: Item, _args: CellClickedEventArgs) => {
      const item = dataView?.getItem(row);
      const cid = gridColIds[col];
      if (item && cid) {
        onGridClick?.(row, col, item as DataRow, cid, item[cid]);
      }
    },
    [dataView, gridColIds, onGridClick]
  );

  // Sorting: click a header to sort by that column (click again to reverse);
  // shift-click to add / reverse a column in a multi-column sort.
  const handleHeaderClicked = React.useCallback(
    (colIndex: number, args: HeaderClickedEventArgs) => {
      const cid = gridColIds[colIndex];
      if (!cid || cid.startsWith("_")) {
        return;
      }
      const cur = sortKey ?? [];
      const existing = cur.find(([c]) => c === cid);
      let next: [string, boolean][];
      if (args.shiftKey) {
        next = existing
          ? cur.map(([c, asc]) => [c, c === cid ? !asc : asc])
          : [...cur, [cid, true]];
      } else {
        next = [[cid, existing ? !existing[1] : true]];
      }
      onSetSortKey?.(next);
    },
    [gridColIds, sortKey, onSetSortKey]
  );

  const handleColumnResize = React.useCallback(
    (column: GridColumn, newSize: number) => {
      const cid = (column as any).id as string;
      userWidths.current[cid] = newSize;
      setWidthsVersion((v) => v + 1);
    },
    []
  );

  const handleColumnMoved = React.useCallback(
    (startIndex: number, endIndex: number) => {
      if (isPivoted && (startIndex === 0 || endIndex === 0)) {
        return; // keep the pivot column first
      }
      const colIds = [...gridColIds];
      const [moved] = colIds.splice(startIndex, 1);
      colIds.splice(endIndex, 0, moved);
      onSetColumnOrder?.(colIds.filter((cid) => !cid.startsWith("_")));
    },
    [gridColIds, isPivoted, onSetColumnOrder]
  );

  const [selection, setSelection] = React.useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });

  const handleSelectionChange = React.useCallback(
    (sel: GridSelection) => {
      setSelection(sel);
      const range = sel.current?.range;
      if (!range || !dataView) {
        return;
      }
      const fromCol = range.x;
      const toCol = range.x + range.width - 1;
      const fromRow = range.y;
      const toRow = range.y + range.height - 1;
      const colIds = gridColIds.slice(fromCol, toCol + 1);
      const items: any[][] = [];
      for (let row = fromRow; row <= toRow; row++) {
        const rowData = dataView.getItem(row);
        if (rowData) {
          items.push(colIds.map((cid) => rowData[cid]));
        }
      }
      onGridSelectionChange?.(
        { row: fromRow, column: fromCol },
        { row: toRow, column: toCol },
        colIds,
        items
      );
    },
    [dataView, gridColIds, onGridSelectionChange]
  );

  // Copy (Cmd/Ctrl-C) of the selected range, from the rows currently loaded:
  const getCellsForSelection = React.useCallback(
    (rect: Rectangle): readonly (readonly GridCell[])[] => {
      const ret: GridCell[][] = [];
      for (let row = rect.y; row < rect.y + rect.height; row++) {
        const rowCells: GridCell[] = [];
        for (let col = rect.x; col < rect.x + rect.width; col++) {
          rowCells.push(getCellContent([col, row]));
        }
        ret.push(rowCells);
      }
      return ret;
    },
    [getCellContent]
  );

  const lm = showLoadingModal ? <LoadingModal embedded={embedded} /> : null;
  const rows = dataView ? dataView.getLength() : 0;

  const gridRef = React.useRef<DataEditorRef>(null);
  React.useEffect(() => {
    if (!testHooksEnabled) {
      return;
    }
    const hooks: GridTestHooks = {
      getBounds: (col, row) => gridRef.current?.getBounds(col, row),
      scrollTo: (col, row) =>
        gridRef.current?.scrollTo(col, row, "both", 0, 0, {
          vAlign: "start",
        }),
      columnIds: gridColIds,
      rowCount: rows,
    };
    (window as any).__tadGrid = hooks;
  });

  return (
    <div className="gridPaneOuter">
      <div className="gridPaneInner">
        {dataView ? (
          <DataEditor
            ref={gridRef}
            width="100%"
            height="100%"
            theme={gridTheme}
            rowHeight={ROW_HEIGHT}
            headerHeight={HEADER_HEIGHT}
            columns={columns}
            rows={rows}
            getCellContent={getCellContent}
            customRenderers={customRenderers}
            getRowThemeOverride={getRowThemeOverride}
            freezeColumns={isPivoted ? 1 : 0}
            onVisibleRegionChanged={handleVisibleRegionChanged}
            onCellClicked={handleCellClicked}
            onHeaderClicked={handleHeaderClicked}
            onColumnResize={handleColumnResize}
            onColumnMoved={handleColumnMoved}
            gridSelection={selection}
            onGridSelectionChange={handleSelectionChange}
            rangeSelect="rect"
            columnSelect="none"
            rowSelect="none"
            getCellsForSelection={getCellsForSelection}
            smoothScrollX={true}
            smoothScrollY={true}
          />
        ) : null}
      </div>
      {lm}
    </div>
  );
};
