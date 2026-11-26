/**
 * Tad's default grid: built from ordinary DOM elements, virtualized with
 * TanStack Virtual (@tanstack/react-virtual) and styled after the DuckDB UI's
 * result grid. Implements the same DataGridProps as the SlickGrid DataGrid
 * and GlideDataGrid, which remain selectable for comparison (see GridPane).
 *
 * Layout: one scroll container (.tad-grid-scroller) holds a "sizer" as wide
 * as all the columns and as tall as the header plus the rows (capped, see
 * scaledScroll.ts). The header and the body inside it are position: sticky,
 * so they stay in view vertically but scroll horizontally with the content.
 * The body is exactly the height of the visible area, and the rows in it are
 * positioned from the *virtual* scroll offset, so tables of any length scroll.
 *
 * Rows are virtualized by TanStack using that virtual offset (we supply it
 * through observeElementOffset instead of letting TanStack read scrollTop).
 * Columns are virtualized horizontally by TanStack as usual; the pivot column
 * is always rendered and frozen with position: sticky.
 *
 * Not yet implemented: auto-scrolling while drag-selecting past the edge of
 * the grid, column histograms for the pivot column, a row number column.
 */
import { Icon } from "@blueprintjs/core";
import {
  defaultRangeExtractor,
  observeElementRect,
  Range,
  Rect,
  useVirtualizer,
  VirtualItem,
  Virtualizer,
} from "@tanstack/react-virtual";
import _ from "lodash";
import * as React from "react";
import * as reltab from "reltab";
import { DataRow, PagedDataView } from "../PagedDataView";
import { NumericColumnHistogram } from "./ColumnHistogram";
import { DataGridProps } from "./DataGrid";
import "./DomDataGrid.css";
import { LoadingModal } from "./LoadingModal";
import * as ss from "./scaledScroll";

const ROW_HEIGHT = 28; // 27px of content plus a 1px grid line
const HEADER_HEIGHT = 28;
const HISTOGRAM_HEIGHT = 80;
const INDENT_PER_LEVEL = 15; // pixels, as in the SlickGrid DataGrid
const MIN_COL_WIDTH = 40;
const DEFAULT_COL_WIDTH = 120;
const ROW_OVERSCAN = 6;
const COL_OVERSCAN = 2;
const DRAG_THRESHOLD = 4; // pixels before a header press becomes a drag

interface CellPos {
  row: number;
  col: number;
}

interface Selection {
  anchor: CellPos;
  focus: CellPos;
}

interface ColumnMeta {
  cid: string;
  title: string;
  /** reltab ColumnKind, or "pivot" / "hidden" for Tad's own columns */
  kind: string;
  formatter: (val: any) => string | null | undefined;
  /** CSS class names for cells, from getColumnCssClassName */
  cellClass: string;
}

const DATE_KINDS = new Set(["date", "time", "datetime", "timestamp"]);

// reltab gives DuckDB's DATE the kind "timestamp"; show it as a date:
const displayKind = (ct: reltab.ColumnType): string =>
  ct.kind === "timestamp" && ct.sqlTypeName.toUpperCase() === "DATE"
    ? "date"
    : ct.kind;

/*
 * Column width estimates, from text measured in the grid's font.
 */
const CELL_PADDING = 16;
const HEADER_EXTRAS = 16 + 22 + 18; // padding, type icon + gap, sort indicator
const MAX_EST_WIDTH = 400;
const MAX_ROWS_MEASURED = 500;

let measureCtx: CanvasRenderingContext2D | null = null;
const measureText = (text: string, font: string): number => {
  if (measureCtx == null) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  if (measureCtx == null) {
    return 7 * text.length;
  }
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
};

const htmlText = (html: string): string =>
  html.indexOf("<") < 0 && html.indexOf("&") < 0
    ? html
    : (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "");

interface GridFonts {
  cell: string;
  header: string;
}

// Until the grid is mounted and we can read its computed font:
const DEFAULT_FONTS: GridFonts = {
  cell: '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  header: '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

function estimateColWidth(
  meta: ColumnMeta,
  dataView: PagedDataView,
  fonts: GridFonts
): number {
  let width = 0;
  const offset = dataView.getOffset();
  const end = offset + Math.min(dataView.getItemCount(), MAX_ROWS_MEASURED);
  for (let i = offset; i < end; i++) {
    const item = dataView.getItem(i);
    if (item == null) {
      continue;
    }
    if (meta.kind === "pivot") {
      const text = item._pivot == null ? "" : String(item._pivot);
      const w =
        (item._depth ?? 0) * INDENT_PER_LEVEL +
        16 +
        measureText(text, item._isLeaf ? fonts.cell : "600 " + fonts.cell);
      width = Math.max(width, w);
    } else {
      const val = item[meta.cid];
      const [html] = cellContent(meta, val, true);
      // (bold allows for aggregate rows)
      width = Math.max(width, measureText(htmlText(html), "600 " + fonts.cell));
    }
  }
  const headerWidth = measureText(meta.title, fonts.header) + HEADER_EXTRAS;
  return Math.round(
    clamp(Math.max(width + CELL_PADDING + 2, headerWidth), 60, MAX_EST_WIDTH)
  );
}

const rawText = (val: any): string => {
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

// Quote values containing tabs or newlines, for tab-separated copy:
const escapeTsv = (s: string): string =>
  /[\t\r\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;

/**
 * HTML and extra class names for a cell. The column formatters produce HTML
 * (escaped text, or an <a> element for URLs), as they did for SlickGrid.
 */
const cellContent = (
  meta: ColumnMeta,
  val: any,
  isLeafRow: boolean
): [string, string] => {
  if (val == null) {
    // Only leaf rows show NULL: an aggregate row's null usually means "no
    // single value", not a NULL in the data.
    return isLeafRow
      ? ['<span class="tad-grid-null-text">NULL</span>', " tad-grid-null"]
      : ["", ""];
  }
  if (meta.kind === "boolean" && typeof val === "boolean") {
    return [String(val), val ? " tad-grid-true" : " tad-grid-false"];
  }
  const fmt = meta.formatter(val);
  if (fmt == null) {
    return ["", ""];
  }
  if (DATE_KINDS.has(meta.kind) && fmt.indexOf("<") < 0) {
    // Dim the separators in dates and times:
    return [
      fmt.replace(/[-:]/g, (s) => `<span class="tad-grid-sep">${s}</span>`),
      "",
    ];
  }
  return [fmt, ""];
};

const TypeIcon = ({ kind }: { kind: string }) => {
  switch (kind) {
    case "integer":
      return <span className="tad-grid-type-text">123</span>;
    case "real":
      return <span className="tad-grid-type-text">#</span>;
    case "string":
      return <Icon icon="font" size={11} />;
    case "boolean":
      return <Icon icon="tick" size={11} />;
    case "date":
      return <Icon icon="calendar" size={11} />;
    case "time":
    case "datetime":
    case "timestamp":
      return <Icon icon="time" size={11} />;
    case "pivot":
      return <Icon icon="diagram-tree" size={11} />;
    default:
      return <Icon icon="help" size={11} />;
  }
};

const PivotCellContent = ({ item }: { item: DataRow }) => (
  <>
    <span
      className="tad-grid-indent"
      style={{ width: (item._depth ?? 0) * INDENT_PER_LEVEL }}
    />
    <span className="tad-grid-toggle">
      {item._isLeaf ? null : (
        <Icon icon={item._isOpen ? "chevron-down" : "chevron-right"} size={12} />
      )}
    </span>
    <span className="tad-grid-pivot-text">
      {item._pivot == null ? "" : String(item._pivot)}
    </span>
  </>
);

/**
 * Lay out the visible columns of a row: frozen columns (always included by
 * the range extractor) are sticky, and a spacer fills any gap before the
 * next visible column.
 */
function layoutColumns(
  colItems: VirtualItem[],
  frozenCount: number,
  renderCell: (ci: VirtualItem, className: string) => React.ReactNode
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let x = 0;
  for (const ci of colItems) {
    if (ci.start > x) {
      out.push(
        <div
          key={`gap-${ci.index}`}
          className="tad-grid-gap"
          style={{ width: ci.start - x }}
        />
      );
    }
    x = ci.end;
    out.push(renderCell(ci, ci.index < frozenCount ? " tad-grid-frozen" : ""));
  }
  return out;
}

interface GridRowProps {
  rowIndex: number;
  item: DataRow | null;
  columns: ColumnMeta[];
  colItems: VirtualItem[];
  totalWidth: number;
  frozenCount: number;
  isPivoted: boolean;
  /** range of selected columns in this row, or -1 */
  selFrom: number;
  selTo: number;
  /** column of the focused cell if it's in this row, or -1 */
  focusCol: number;
}

const GridRow = React.memo(function GridRow({
  rowIndex,
  item,
  columns,
  colItems,
  totalWidth,
  frozenCount,
  isPivoted,
  selFrom,
  selTo,
  focusCol,
}: GridRowProps) {
  const isAggregate = item != null && isPivoted && !item._isLeaf;
  const isLeafRow = !isPivoted || (item?._isLeaf ?? true);
  const cells = layoutColumns(colItems, frozenCount, (ci, frozenClass) => {
    const meta = columns[ci.index];
    let className = "tad-grid-cell" + frozenClass;
    if (meta.cellClass) {
      className += " " + meta.cellClass;
    }
    if (ci.index >= selFrom && ci.index <= selTo) {
      className += " tad-grid-selected";
    }
    if (ci.index === focusCol) {
      className += " tad-grid-focus";
    }
    const style = { width: ci.size };
    if (item == null) {
      return (
        <div
          key={ci.index}
          role="gridcell"
          aria-colindex={ci.index + 1}
          data-col={ci.index}
          className={className}
          style={style}
        />
      );
    }
    if (meta.kind === "pivot") {
      return (
        <div
          key={ci.index}
          role="gridcell"
          aria-colindex={ci.index + 1}
          data-col={ci.index}
          className={className + " tad-grid-pivot-cell pivot-column"}
          style={style}
        >
          <PivotCellContent item={item} />
        </div>
      );
    }
    const [html, extraClass] = cellContent(meta, item[meta.cid], isLeafRow);
    // Most cells are plain text: set it as text rather than parsing HTML.
    const isPlain = html.indexOf("<") < 0 && html.indexOf("&") < 0;
    return isPlain ? (
      <div
        key={ci.index}
        role="gridcell"
        aria-colindex={ci.index + 1}
        data-col={ci.index}
        className={className + extraClass}
        style={style}
      >
        {html}
      </div>
    ) : (
      <div
        key={ci.index}
        role="gridcell"
        aria-colindex={ci.index + 1}
        data-col={ci.index}
        className={className + extraClass}
        style={style}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });
  return (
    <div
      role="row"
      aria-rowindex={rowIndex + 2}
      data-row={rowIndex}
      className={
        "tad-grid-row" +
        (isAggregate ? " grid-aggregate-row" : "") +
        (item == null ? " tad-grid-loading-row" : "")
      }
      style={{ width: totalWidth }}
    >
      {cells}
    </div>
  );
});

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(x, hi));

export const DomDataGrid: React.FunctionComponent<DataGridProps> = (
  props: DataGridProps
) => {
  const {
    dataView,
    showColumnHistograms,
    histoMap,
    getColumnFormatter,
    getColumnCssClassName,
    pivotColumnDisplayName,
    isPivoted,
    showHiddenColumns,
    displayColumns,
    showLoadingModal,
    onViewportChanged,
    onHistogramBrushRange,
    onHistogramBrushFilter,
    sortKey,
    onSetSortKey,
    onGridClick,
    onGridSelectionChange,
    onSetColumnOrder,
    clipboard,
    embedded,
  } = props;

  const schema = dataView?.schema;
  const rowCount = dataView ? dataView.getLength() : 0;

  // ---------------------------------------------------------------- columns

  // Column ids in display order (same rules as the SlickGrid DataGrid):
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

  const columns: ColumnMeta[] = React.useMemo(() => {
    if (!schema) {
      return [];
    }
    return gridColIds.map((cid) => {
      if (cid === "_pivot") {
        return {
          cid,
          title: pivotColumnDisplayName ?? "",
          kind: "pivot",
          formatter: rawText,
          cellClass: "",
        };
      }
      if (schema.columnIndex(cid) == null) {
        return { cid, title: cid, kind: "hidden", formatter: rawText, cellClass: "" };
      }
      return {
        cid,
        title: schema.displayName(cid),
        kind: displayKind(schema.columnType(cid)),
        formatter: getColumnFormatter(schema, cid),
        cellClass: getColumnCssClassName(schema, cid) ?? "",
      };
    });
  }, [
    schema,
    gridColIds,
    pivotColumnDisplayName,
    getColumnFormatter,
    getColumnCssClassName,
  ]);

  const frozenCount = isPivoted ? 1 : 0;

  // The grid's fonts, for measuring text (read once the grid is mounted):
  const [fonts, setFonts] = React.useState<GridFonts>(DEFAULT_FONTS);

  // Column widths: estimated from the loaded rows when a column first
  // appears (as in the SlickGrid DataGrid), unless the user has resized it.
  const [userWidths, setUserWidths] = React.useState<{ [cid: string]: number }>(
    {}
  );
  const estWidths = React.useRef<{ [cid: string]: number }>({});
  const estFonts = React.useRef(fonts);
  const colWidths: number[] = React.useMemo(() => {
    if (estFonts.current !== fonts) {
      estWidths.current = {};
      estFonts.current = fonts;
    }
    const hasData = dataView != null && dataView.getItemCount() > 0;
    return columns.map((meta) => {
      const userWidth = userWidths[meta.cid];
      if (userWidth != null) {
        return userWidth;
      }
      const cached = estWidths.current[meta.cid];
      if (cached != null && meta.cid !== "_pivot") {
        return cached;
      }
      if (!hasData) {
        return DEFAULT_COL_WIDTH;
      }
      const est = estimateColWidth(meta, dataView!, fonts);
      estWidths.current[meta.cid] = est;
      return est;
    });
  }, [columns, userWidths, dataView, fonts]);

  const colStarts: number[] = React.useMemo(() => {
    const starts: number[] = [];
    let x = 0;
    for (const w of colWidths) {
      starts.push(x);
      x += w;
    }
    starts.push(x);
    return starts;
  }, [colWidths]);
  const totalWidth = colStarts[colStarts.length - 1] ?? 0;

  // ------------------------------------------------------------- scrolling

  const rootRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  const showHistograms =
    !!showColumnHistograms && !!histoMap && Object.keys(histoMap).length > 0;
  const headerHeight = HEADER_HEIGHT + (showHistograms ? HISTOGRAM_HEIGHT : 0);
  const headerHeightRef = React.useRef(headerHeight);
  headerHeightRef.current = headerHeight;

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const cs = getComputedStyle(root);
    const cell = `${cs.fontSize} ${cs.fontFamily}`;
    setFonts((f) => (f.cell === cell ? f : { cell, header: "500 " + cell }));
  }, [dataView != null]);

  // Height of the scroller's visible area below the header:
  const [bodyHeight, setBodyHeight] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const update = () =>
      setBodyHeight(Math.max(0, el.clientHeight - headerHeightRef.current));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [headerHeight, dataView != null]);

  const geometry: ss.ScrollGeometry = {
    contentHeight: rowCount * ROW_HEIGHT,
    viewportHeight: bodyHeight,
  };
  const geomRef = React.useRef(geometry);
  geomRef.current = geometry;

  const virtualYRef = React.useRef(0); // virtual scroll offset of the rows
  const lastScrollTopRef = React.useRef(0);

  /*
   * The rows block is translated by (first rendered row's offset - virtual
   * offset). This is set directly, rather than through React: TanStack only
   * re-renders when the range of rows changes, so a scroll of a few pixels
   * (a mouse wheel's step) wouldn't otherwise move the rows at all, and
   * scrolling would move in whole-row jumps.
   */
  const rowsRef = React.useRef<HTMLDivElement>(null);
  const firstRowStartRef = React.useRef(0); // set by each render
  const applyRowsOffset = React.useCallback(() => {
    const rows = rowsRef.current;
    if (rows) {
      const y = firstRowStartRef.current - virtualYRef.current;
      rows.style.transform = `translateY(${y}px)`;
    }
  }, []);
  React.useLayoutEffect(applyRowsOffset);
  const offsetCbRef = React.useRef<
    ((offset: number, isScrolling: boolean) => void) | null
  >(null);

  // Viewport reporting (the data layer fetches the pages containing it):
  const onViewportChangedRef = React.useRef(onViewportChanged);
  onViewportChangedRef.current = onViewportChanged;
  const rowCountRef = React.useRef(rowCount);
  rowCountRef.current = rowCount;
  const reportViewport = React.useMemo(
    () =>
      _.throttle(
        () => {
          const g = geomRef.current;
          const y = virtualYRef.current;
          const top = Math.floor(y / ROW_HEIGHT);
          const bottom = Math.min(
            rowCountRef.current,
            Math.ceil((y + g.viewportHeight) / ROW_HEIGHT)
          );
          onViewportChangedRef.current?.(top, bottom);
        },
        100,
        { leading: false, trailing: true }
      ),
    []
  );
  React.useEffect(() => () => reportViewport.cancel(), [reportViewport]);

  /**
   * Move to a virtual offset; syncPhysical sets scrollTop to match (for
   * wheel and keyboard scrolling, rather than a scroll event we're handling).
   */
  const setVirtualY = React.useCallback(
    (y: number, isScrolling: boolean, syncPhysical: boolean) => {
      const g = geomRef.current;
      const vy = ss.clampVirtual(g, y);
      virtualYRef.current = vy;
      const el = scrollerRef.current;
      if (syncPhysical && el) {
        el.scrollTop = ss.toPhysical(g, vy);
        lastScrollTopRef.current = el.scrollTop;
      }
      // (TanStack re-renders here, synchronously while scrolling, if the
      // range of rows changes; either way, move the rows to the offset:)
      offsetCbRef.current?.(vy, isScrolling);
      applyRowsOffset();
      reportViewport();
    },
    [reportViewport, applyRowsOffset]
  );

  const handleScroll = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const st = el.scrollTop;
    if (st === lastScrollTopRef.current) {
      return; // horizontal scroll, or our own write to scrollTop
    }
    lastScrollTopRef.current = st;
    // Native vertical scrolling: scrollbar, or the wheel when not scaled:
    setVirtualY(ss.toVirtual(geomRef.current, st), true, false);
  }, [setVirtualY]);

  // When the table is taller than the browser allows, the wheel moves the
  // virtual offset 1:1 (natively it would move ~ratio times too fast):
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      const g = geomRef.current;
      if (!ss.isScaled(g) || e.ctrlKey) {
        return;
      }
      e.preventDefault();
      let dy = ss.wheelDeltaPixels(e.deltaY, e.deltaMode, ROW_HEIGHT, g.viewportHeight);
      let dx = ss.wheelDeltaPixels(e.deltaX, e.deltaMode, ROW_HEIGHT, el.clientWidth);
      if (e.shiftKey && dx === 0) {
        [dx, dy] = [dy, 0];
      }
      if (dx !== 0) {
        el.scrollLeft += dx;
      }
      if (dy !== 0) {
        setVirtualY(virtualYRef.current + dy, true, true);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setVirtualY, dataView != null]);

  // Keep the offset in range and scrollTop in sync when the row count or
  // the viewport changes (also reports the initial viewport):
  React.useLayoutEffect(() => {
    setVirtualY(virtualYRef.current, false, true);
  }, [rowCount, bodyHeight, headerHeight, setVirtualY]);

  // N.B. TanStack recomputes its measurements (one per row) whenever
  // estimateSize or rangeExtractor change identity, so the options passed
  // to the virtualizers must be stable across renders.
  const rowVirtualizerOptions = React.useMemo(
    () => ({
      getScrollElement: () => scrollerRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: ROW_OVERSCAN,
      observeElementRect: (
        instance: Virtualizer<HTMLDivElement, Element>,
        cb: (rect: Rect) => void
      ) =>
        observeElementRect(instance, (rect) =>
          cb({
            width: rect.width,
            height: Math.max(0, rect.height - headerHeightRef.current),
          })
        ),
      observeElementOffset: (
        _instance: Virtualizer<HTMLDivElement, Element>,
        cb: (offset: number, isScrolling: boolean) => void
      ) => {
        offsetCbRef.current = cb;
        cb(virtualYRef.current, false);
        return () => {
          if (offsetCbRef.current === cb) {
            offsetCbRef.current = null;
          }
        };
      },
      scrollToFn: (offset: number) => setVirtualY(offset, false, true),
    }),
    [setVirtualY]
  );
  const rowVirtualizer = useVirtualizer({
    ...rowVirtualizerOptions,
    count: rowCount,
  });

  const colWidthsRef = React.useRef(colWidths);
  colWidthsRef.current = colWidths;
  const colVirtualizerOptions = React.useMemo(
    () => ({
      horizontal: true,
      getScrollElement: () => scrollerRef.current,
      estimateSize: (i: number) => colWidthsRef.current[i] ?? DEFAULT_COL_WIDTH,
      overscan: COL_OVERSCAN,
      rangeExtractor: (range: Range) => {
        const indexes = defaultRangeExtractor(range);
        if (frozenCount > 0 && indexes[0] !== 0) {
          return [0, ...indexes];
        }
        return indexes;
      },
    }),
    [frozenCount]
  );
  const colVirtualizer = useVirtualizer({
    ...colVirtualizerOptions,
    count: columns.length,
  });
  React.useLayoutEffect(() => {
    colVirtualizer.measure();
  }, [colWidths, colVirtualizer]);

  const rowItems = rowVirtualizer.getVirtualItems();
  const colItems = colVirtualizer.getVirtualItems();

  /** Scroll the minimum distance to show a cell. */
  const revealCell = React.useCallback(
    ({ row, col }: CellPos) => {
      const g = geomRef.current;
      const vy = ss.offsetToReveal(
        g,
        virtualYRef.current,
        row * ROW_HEIGHT,
        (row + 1) * ROW_HEIGHT
      );
      if (vy !== virtualYRef.current) {
        setVirtualY(vy, false, true);
      }
      const el = scrollerRef.current;
      if (!el || col < frozenCount) {
        return;
      }
      const frozenWidth = frozenCount > 0 ? colWidths[0] : 0;
      const left = colStarts[col];
      const right = colStarts[col + 1];
      if (left - frozenWidth < el.scrollLeft) {
        el.scrollLeft = left - frozenWidth;
      } else if (right > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = right - el.clientWidth;
      }
    },
    [setVirtualY, frozenCount, colWidths, colStarts]
  );

  // ------------------------------------------------------------- selection

  const [selection, setSelection] = React.useState<Selection | null>(null);
  const selectionRef = React.useRef(selection);
  selectionRef.current = selection;

  const selRange = selection
    ? {
        r0: Math.min(selection.anchor.row, selection.focus.row),
        r1: Math.max(selection.anchor.row, selection.focus.row),
        c0: Math.min(selection.anchor.col, selection.focus.col),
        c1: Math.max(selection.anchor.col, selection.focus.col),
      }
    : null;

  // Report selection changes (from / to corners, as the SlickGrid grid did):
  const onGridSelectionChangeRef = React.useRef(onGridSelectionChange);
  onGridSelectionChangeRef.current = onGridSelectionChange;
  React.useEffect(() => {
    if (!selRange || !dataView) {
      return;
    }
    const colIds = gridColIds.slice(selRange.c0, selRange.c1 + 1);
    const items: any[][] = [];
    for (let row = selRange.r0; row <= selRange.r1; row++) {
      const item = dataView.getItem(row);
      if (item) {
        items.push(colIds.map((cid) => item[cid]));
      }
    }
    onGridSelectionChangeRef.current?.(
      { row: selRange.r0, column: selRange.c0 },
      { row: selRange.r1, column: selRange.c1 },
      colIds,
      items
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selRange?.r0, selRange?.r1, selRange?.c0, selRange?.c1]);

  const selectionText = (): string | null => {
    if (!selRange || !dataView) {
      return null;
    }
    const colIds = gridColIds.slice(selRange.c0, selRange.c1 + 1);
    const lines: string[] = [];
    for (let row = selRange.r0; row <= selRange.r1; row++) {
      const item = dataView.getItem(row);
      // (Rows that aren't loaded are left out, as with SlickGrid.)
      if (item) {
        lines.push(colIds.map((cid) => escapeTsv(rawText(item[cid]))).join("\t"));
      }
    }
    return lines.join("\r\n");
  };
  const selectionTextRef = React.useRef(selectionText);
  selectionTextRef.current = selectionText;

  // Copy (Cmd/Ctrl-C, or Edit > Copy in Electron) while the grid has focus.
  // The copy event goes to the document (the grid isn't editable), so we
  // listen there and check where the focus is.
  React.useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const root = rootRef.current;
      if (!root || !root.contains(document.activeElement)) {
        return;
      }
      const text = selectionTextRef.current();
      if (text == null) {
        return;
      }
      if (e.clipboardData) {
        e.clipboardData.setData("text/plain", text);
        e.preventDefault();
      } else {
        clipboard.writeText(text);
      }
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [clipboard]);

  const cellFromPoint = (x: number, y: number): CellPos | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cellEl = el?.closest<HTMLElement>("[data-col]");
    const rowEl = cellEl?.closest<HTMLElement>("[data-row]");
    if (!cellEl || !rowEl || !rootRef.current?.contains(rowEl)) {
      return null;
    }
    return { row: Number(rowEl.dataset.row), col: Number(cellEl.dataset.col) };
  };

  const clickCell = (cell: CellPos) => {
    const item = dataView?.getItem(cell.row);
    const meta = columns[cell.col];
    if (item && meta) {
      onGridClick?.(cell.row, cell.col, item, meta.cid, item[meta.cid]);
    }
  };

  const dragSelect = React.useRef<{ start: CellPos; moved: boolean; extend: boolean } | null>(
    null
  );

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) {
      return;
    }
    e.preventDefault(); // no text selection
    rootRef.current?.focus({ preventScroll: true });
    const extend = e.shiftKey && selection != null;
    setSelection(
      extend ? { anchor: selection!.anchor, focus: cell } : { anchor: cell, focus: cell }
    );
    dragSelect.current = { start: cell, moved: false, extend };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleBodyPointerMove = (e: React.PointerEvent) => {
    const drag = dragSelect.current;
    if (!drag) {
      return;
    }
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) {
      return;
    }
    if (cell.row !== drag.start.row || cell.col !== drag.start.col) {
      drag.moved = true;
    }
    setSelection((s) =>
      s && s.focus.row === cell.row && s.focus.col === cell.col
        ? s
        : { anchor: s?.anchor ?? cell, focus: cell }
    );
  };

  const handleBodyPointerUp = () => {
    const drag = dragSelect.current;
    dragSelect.current = null;
    if (drag && !drag.moved && !drag.extend) {
      clickCell(drag.start);
    }
  };

  // Links in cells open through onGridClick (Tad's click handlers):
  const handleBodyClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) {
      e.preventDefault();
    }
  };

  // Tooltip for text that doesn't fit:
  const handleBodyPointerOver = (e: React.PointerEvent) => {
    const cellEl = (e.target as HTMLElement).closest<HTMLElement>(".tad-grid-cell");
    if (cellEl) {
      const clipped = cellEl.scrollWidth > cellEl.clientWidth;
      const text = clipped ? cellEl.textContent ?? "" : "";
      if (cellEl.title !== text) {
        cellEl.title = text;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (rowCount === 0 || columns.length === 0) {
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "a") {
      e.preventDefault();
      setSelection({
        anchor: { row: 0, col: 0 },
        focus: { row: rowCount - 1, col: columns.length - 1 },
      });
      return;
    }
    if (e.key === "Escape") {
      setSelection(null);
      return;
    }
    const sel = selection ?? {
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
    };
    if (e.key === "Enter") {
      e.preventDefault();
      clickCell(sel.focus);
      return;
    }
    let { row, col } = sel.focus;
    const pageRows = Math.max(1, Math.floor(bodyHeight / ROW_HEIGHT) - 1);
    switch (e.key) {
      case "ArrowUp":
        row = mod ? 0 : row - 1;
        break;
      case "ArrowDown":
        row = mod ? rowCount - 1 : row + 1;
        break;
      case "ArrowLeft":
        col = mod ? 0 : col - 1;
        break;
      case "ArrowRight":
        col = mod ? columns.length - 1 : col + 1;
        break;
      case "PageUp":
        row -= pageRows;
        break;
      case "PageDown":
        row += pageRows;
        break;
      case "Home":
        col = 0;
        if (mod) {
          row = 0;
        }
        break;
      case "End":
        col = columns.length - 1;
        if (mod) {
          row = rowCount - 1;
        }
        break;
      default:
        return;
    }
    e.preventDefault();
    const focus = {
      row: clamp(row, 0, rowCount - 1),
      col: clamp(col, 0, columns.length - 1),
    };
    setSelection(
      e.shiftKey && selection ? { anchor: selection.anchor, focus } : { anchor: focus, focus }
    );
    revealCell(focus);
  };

  // --------------------------------------------- header: sort, resize, move

  const [dropX, setDropX] = React.useState<number | null>(null);

  // Insertion index (0..n) for a column dropped at clientX:
  const dropIndexAt = (clientX: number): number => {
    const el = scrollerRef.current!;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft;
    let i = frozenCount;
    while (i < columns.length && colStarts[i] + colWidths[i] / 2 < x) {
      i++;
    }
    return i;
  };

  const sortBy = (cid: string, extend: boolean) => {
    const cur = sortKey ?? [];
    const existing = cur.find(([c]) => c === cid);
    let next: [string, boolean][];
    if (extend) {
      next = existing
        ? cur.map(([c, asc]) => [c, c === cid ? !asc : asc] as [string, boolean])
        : [...cur, [cid, true]];
    } else {
      next = [[cid, existing ? !existing[1] : true]];
    }
    onSetSortKey?.(next);
  };

  const handleHeaderPointerDown = (e: React.PointerEvent, colIndex: number) => {
    if (e.button !== 0) {
      return;
    }
    const meta = columns[colIndex];
    const startX = e.clientX;
    const shiftKey = e.shiftKey;
    const movable = colIndex >= frozenCount && !meta.cid.startsWith("_");
    let dragging = false;
    const onMove = (me: PointerEvent) => {
      if (!movable) {
        return;
      }
      if (!dragging && Math.abs(me.clientX - startX) > DRAG_THRESHOLD) {
        dragging = true;
      }
      if (dragging) {
        const el = scrollerRef.current!;
        const idx = dropIndexAt(me.clientX);
        setDropX(colStarts[idx] - el.scrollLeft);
      }
    };
    const onUp = (ue: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDropX(null);
      if (dragging) {
        const to = dropIndexAt(ue.clientX);
        if (to !== colIndex && to !== colIndex + 1) {
          const colIds = [...gridColIds];
          const [moved] = colIds.splice(colIndex, 1);
          colIds.splice(to > colIndex ? to - 1 : to, 0, moved);
          onSetColumnOrder?.(colIds.filter((cid) => !cid.startsWith("_")));
        }
      } else if (!meta.cid.startsWith("_")) {
        sortBy(meta.cid, shiftKey);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleResizePointerDown = (e: React.PointerEvent, colIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    const cid = columns[colIndex].cid;
    const startX = e.clientX;
    const startWidth = colWidths[colIndex];
    const onMove = (me: PointerEvent) => {
      const width = Math.max(MIN_COL_WIDTH, Math.round(startWidth + me.clientX - startX));
      setUserWidths((w) => (w[cid] === width ? w : { ...w, [cid]: width }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // The header only changes with the columns, not when scrolling vertically,
  // so it's memoized; its handlers go through a ref to stay current.
  const headerHandlers = React.useRef({
    down: handleHeaderPointerDown,
    resize: handleResizePointerDown,
  });
  headerHandlers.current = {
    down: handleHeaderPointerDown,
    resize: handleResizePointerDown,
  };

  const headerCells = React.useMemo(() => {
    const sortInfo = new Map<string, [number, boolean]>();
    (sortKey ?? []).forEach(([cid, asc], idx) => sortInfo.set(cid, [idx, asc]));
    const multiSort = (sortKey?.length ?? 0) > 1;
    return layoutColumns(colItems, frozenCount, (ci, frozenClass) => {
      const meta = columns[ci.index];
      const si = sortInfo.get(meta.cid);
      return (
        <div
          key={ci.index}
          role="columnheader"
          aria-colindex={ci.index + 1}
          aria-sort={si ? (si[1] ? "ascending" : "descending") : undefined}
          data-col={ci.index}
          data-col-id={meta.cid}
          className={"tad-grid-header-cell" + frozenClass}
          style={{ width: ci.size }}
          title={meta.title}
          onPointerDown={(e) => headerHandlers.current.down(e, ci.index)}
        >
          <span className="tad-grid-type-icon">
            <TypeIcon kind={meta.kind} />
          </span>
          <span className="tad-grid-header-title">{meta.title}</span>
          {si ? (
            <span className="tad-grid-sort">
              <Icon icon={si[1] ? "arrow-up" : "arrow-down"} size={10} />
              {multiSort ? si[0] + 1 : null}
            </span>
          ) : null}
          <span
            className="tad-grid-resize-handle"
            onPointerDown={(e) => headerHandlers.current.resize(e, ci.index)}
          />
        </div>
      );
    });
  }, [colItems, frozenCount, columns, sortKey]);

  const histogramCells = React.useMemo(
    () =>
      showHistograms
        ? layoutColumns(colItems, frozenCount, (ci, frozenClass) => {
            const meta = columns[ci.index];
            const histo = histoMap?.[meta.cid];
            return (
              <div
                key={ci.index}
                className={"tad-grid-histogram-cell" + frozenClass}
                style={{ width: ci.size }}
              >
                {histo && schema ? (
                  <NumericColumnHistogram
                    histData={histo}
                    colType={schema.columnType(meta.cid)}
                    onHistogramBrushRange={onHistogramBrushRange}
                    onHistogramBrushFilter={onHistogramBrushFilter}
                  />
                ) : null}
              </div>
            );
          })
        : null,
    [
      showHistograms,
      colItems,
      frozenCount,
      columns,
      histoMap,
      schema,
      onHistogramBrushRange,
      onHistogramBrushFilter,
    ]
  );

  // ------------------------------------------------------------------ rows

  // Rows are keyed by "slot" (index modulo the number of rows rendered), so
  // that scrolling reuses their elements rather than creating new ones.
  const slots = rowItems.length;
  const rows = rowItems.map((vi) => {
    const r = vi.index;
    const inSel = selRange != null && r >= selRange.r0 && r <= selRange.r1;
    return (
      <GridRow
        key={r % slots}
        rowIndex={r}
        item={dataView ? dataView.getItem(r) : null}
        columns={columns}
        colItems={colItems}
        totalWidth={totalWidth}
        frozenCount={frozenCount}
        isPivoted={!!isPivoted}
        selFrom={inSel ? selRange!.c0 : -1}
        selTo={inSel ? selRange!.c1 : -1}
        focusCol={selection && selection.focus.row === r ? selection.focus.col : -1}
      />
    );
  });
  // The rows are positioned by applyRowsOffset(), after each render and on
  // every scroll (see rowsRef):
  firstRowStartRef.current = rowItems.length > 0 ? rowItems[0].start : 0;

  const physH = ss.physicalHeight(geometry);
  const lm = showLoadingModal ? <LoadingModal embedded={embedded} /> : null;

  return (
    <div className="gridPaneOuter">
      <div className="gridPaneInner">
        {dataView ? (
          <div
            ref={rootRef}
            className="tad-grid"
            role="grid"
            aria-rowcount={rowCount + 1}
            aria-colcount={columns.length}
            aria-multiselectable={true}
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <div
              ref={scrollerRef}
              className="tad-grid-scroller"
              onScroll={handleScroll}
            >
              <div
                className="tad-grid-sizer"
                style={{ width: totalWidth, height: headerHeight + physH }}
              >
                <div className="tad-grid-header" style={{ width: totalWidth }}>
                  <div role="row" aria-rowindex={1} className="tad-grid-header-row">
                    {headerCells}
                  </div>
                  {histogramCells ? (
                    <div className="tad-grid-histogram-row">{histogramCells}</div>
                  ) : null}
                </div>
                <div
                  className="tad-grid-body"
                  style={{
                    top: headerHeight,
                    width: totalWidth,
                    height: Math.min(bodyHeight, physH),
                  }}
                  onPointerDown={handleBodyPointerDown}
                  onPointerMove={handleBodyPointerMove}
                  onPointerUp={handleBodyPointerUp}
                  onPointerOver={handleBodyPointerOver}
                  onClick={handleBodyClick}
                >
                  <div ref={rowsRef} className="tad-grid-rows">
                    {rows}
                  </div>
                </div>
              </div>
            </div>
            {dropX != null ? (
              <div className="tad-grid-drop-indicator" style={{ left: dropX }} />
            ) : null}
          </div>
        ) : null}
      </div>
      {lm}
    </div>
  );
};
