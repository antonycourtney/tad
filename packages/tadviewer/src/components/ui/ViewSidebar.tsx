/*
 * The new UI's view settings sidebar, as in the mock-up: the Pivot and Sort
 * shelves, the column list (Layout, Aggregation and Format modes) and
 * Options. The column list scrolls; the shelves and Options stay put.
 *
 * Layout mode is a small table: a Column · Show · Pivot · Sort header, then
 * a row of plain check boxes for each column. A box is empty when off, and
 * shows a mark when on: a tick, the column's place in the pivot, or its sort
 * direction (and place, when sorting by more than one column).
 *
 * The list is in the grid's order (the shown columns, then the hidden ones),
 * or A to Z; dragging a row reorders the grid's columns only in the grid's
 * order. The sidebar's width is the user's (SidebarSash).
 */
import * as React from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  SortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StateRef } from "oneref";
import { AggFn, aggFns, ColumnKind, ColumnType, defaultAggFn, Schema } from "reltab";
import * as actions from "../../actions";
import { AppState } from "../../AppState";
import { ViewParams } from "../../ViewParams";
import { ViewState } from "../../ViewState";
import {
  editableFormat,
  FALLBACK_SAMPLES,
  FormatEditor,
  FormatTarget,
  kindName,
  loadedRows,
  sampleValues,
  Switch,
} from "./FormatEditor";
import { byName, ColumnSearch, useColumnsAZ } from "./ColumnSearch";
import { ArrowDown, ArrowUp, Check, ChevronDown, Minus } from "./icons";
import {
  collisions,
  dragId,
  Grip,
  parseDragId,
  placed,
  Shelves,
  useDragSensors,
} from "./Shelves";
import { SidebarSash, useSidebarWidthStyle } from "./SidebarSash";
import { typeIcon } from "./typeIcon";
import "./ui.css";

type Mode = "layout" | "aggregation" | "format";

const MODES: [Mode, string][] = [
  ["layout", "Layout"],
  ["aggregation", "Aggregation"],
  ["format", "Format"],
];

export interface ViewSidebarProps {
  expanded: boolean;
  viewState: ViewState;
  stateRef: StateRef<AppState>;
}

/** The columns in display order, then the hidden ones (in the table's order). */
const columnOrder = (schema: Schema, viewParams: ViewParams): string[] => {
  const shown = viewParams.displayColumns;
  return [...shown, ...schema.columns.filter((c) => !shown.includes(c))];
};

const TypeIcon: React.FC<{ schema: Schema; column: string }> = ({ schema, column }) => (
  <span className="tui-typeicon" aria-hidden="true">
    {typeIcon(schema.columnType(column).kind)}
  </span>
);

/** An aggregation function's name, as the menus show it. */
export const aggLabel = (fn: AggFn) =>
  fn === "null" ? "None" : fn.charAt(0).toUpperCase() + fn.slice(1);

const AGG_ORDER: AggFn[] = ["sum", "avg", "min", "max", "count", "uniq", "null"];

/** A column type's aggregation functions, in the mock-up's order. */
export const aggChoices = (ct: ColumnType): AggFn[] => {
  const fns = aggFns(ct);
  return [
    ...AGG_ORDER.filter((fn) => fns.includes(fn)),
    ...fns.filter((fn) => !AGG_ORDER.includes(fn)),
  ];
};

export const ViewSidebar: React.FC<ViewSidebarProps> = ({ expanded, viewState, stateRef }) => {
  const { baseSchema: schema, viewParams } = viewState;
  const [mode, setMode] = useState<Mode>("layout");
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useDragSensors();
  const widthStyle = useSidebarWidthStyle();
  const az = useColumnsAZ();
  const q = search.trim().toLowerCase();
  const order = columnOrder(schema, viewParams);
  const listed = az ? byName(order, schema) : order;
  const matching =
    q === "" ? listed : listed.filter((c) => schema.displayName(c).toLowerCase().includes(q));
  const shown = viewParams.displayColumns;
  const sortKey = viewParams.sortKey;

  // Rows move within the list only to reorder shown columns, and only when
  // the list is in the grid's order (not A to Z, and not while searching).
  // Any row can be dragged onto a shelf.
  const canReorder = (column: string) => q === "" && !az && shown.includes(column);
  const draggingCol = dragging !== null && parseDragId(dragging)[0] === "col";
  const reorderingList = draggingCol && canReorder(parseDragId(dragging!)[1]);
  const listStrategy: SortingStrategy = (args) =>
    reorderingList ? verticalListSortingStrategy(args) : null;

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over) {
      return;
    }
    const [from, column] = parseDragId(active.id);
    const [to, target] = parseDragId(over.id);
    const shelf = to === "shelf" ? target : to;
    if (shelf === "pivot" || shelf === "sort") {
      const ids = shelf === "pivot" ? viewParams.vpivots : sortKey.map(([c]) => c);
      let next: string[];
      if (from === shelf) {
        if (to === "shelf" || target === column) {
          return;
        }
        next = arrayMove(ids, ids.indexOf(column), ids.indexOf(target));
      } else {
        next = placed(ids, column, to === "shelf" ? null : target);
      }
      if (shelf === "pivot") {
        actions.setPivots(next, stateRef);
      } else {
        actions.setSortKey(
          next.map((c) => sortKey.find(([k]) => k === c) ?? [c, true]),
          stateRef
        );
      }
    } else if (from === "col" && to === "col" && target !== column && canReorder(column)) {
      const at = shown.includes(target) ? shown.indexOf(target) : shown.length - 1;
      actions.setColumnOrder(arrayMove(shown, shown.indexOf(column), at), stateRef);
    }
  };

  return (
    <aside
      className={
        "sidebar tad-ui tui-sidebar " + (expanded ? "sidebar-expanded" : "sidebar-collapsed")
      }
      aria-label="View settings"
      style={widthStyle}
    >
      {expanded ? <SidebarSash /> : null}
      <div className="sidebar-content">
        <DndContext
          sensors={sensors}
          collisionDetection={collisions}
          onDragStart={(e) => setDragging(String(e.active.id))}
          onDragCancel={() => setDragging(null)}
          onDragEnd={onDragEnd}
        >
          <div className="tui-vs">
            <Shelves schema={schema} viewParams={viewParams} stateRef={stateRef} />

            <section className="tui-vs-cols" aria-label="Columns">
              <div className="tui-vs-colshead">
                <div className="tui-lbl">Columns</div>
                <div className="tui-seg" role="group" aria-label="Column list shows">
                  {MODES.map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      className="tui-segb"
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <ColumnSearch
                value={search}
                onChange={setSearch}
                placeholder={`Find among ${schema.columns.length} columns`}
                label="Find a column"
              />
              {mode === "layout" ? (
                <LayoutList
                  schema={schema}
                  viewParams={viewParams}
                  stateRef={stateRef}
                  columns={matching}
                  order={order}
                  strategy={listStrategy}
                  canReorder={canReorder}
                />
              ) : mode === "aggregation" ? (
                <AggregationList
                  schema={schema}
                  viewParams={viewParams}
                  stateRef={stateRef}
                  columns={matching}
                />
              ) : (
                <FormatList
                  viewState={viewState}
                  stateRef={stateRef}
                  columns={matching}
                  showDefaults={q === ""}
                />
              )}
            </section>

            <section className="tui-vs-opts" aria-label="Options">
              <div className="tui-lbl">Options</div>
              <Switch
                label="Column histograms"
                on={viewParams.showColumnHistograms}
                onChange={(on) => actions.setShowColumnHistograms(stateRef, on)}
              />
              <Switch
                label="Totals as top row"
                on={viewParams.showRoot}
                onChange={(on) => actions.setShowRoot(on, stateRef)}
              />
            </section>
          </div>
          {createPortal(
            <DragOverlay dropAnimation={null}>
              {dragging ? (
                <div className="tad-ui tui-shelfchip tui-dragchip">
                  <span className="tui-shelfchip-name">
                    <span className="tui-grip">
                      <Grip />
                    </span>
                    <span className="tui-shelfchip-label">
                      {schema.displayName(parseDragId(dragging)[1])}
                    </span>
                  </span>
                </div>
              ) : null}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      </div>
    </aside>
  );
};

// --- Layout: Show, Pivot and Sort boxes; drag to reorder ---

/** A check box: empty when off; a pale blue tint and a dark blue mark when on. */
const Box: React.FC<{
  label: string;
  on: boolean | "mixed";
  title?: string;
  wide?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}> = ({ label, on, title, wide, onClick, children }) => (
  <button
    type="button"
    className={"tui-tg" + (wide ? " tui-wide" : "")}
    aria-label={label}
    aria-pressed={on}
    title={title ?? label}
    onClick={onClick}
  >
    {children}
  </button>
);

const LayoutList: React.FC<{
  schema: Schema;
  viewParams: ViewParams;
  stateRef: StateRef<AppState>;
  columns: string[];
  order: string[];
  strategy: SortingStrategy;
  canReorder: (column: string) => boolean;
}> = ({ schema, viewParams, stateRef, columns, order, strategy, canReorder }) => {
  const nShown = viewParams.displayColumns.length;
  const total = schema.columns.length;
  const allShown = nShown === total;
  const noneShown = nShown === 0;
  return (
    <>
      <div className="tui-mhead" aria-hidden="true">
        <span className="tui-mhead-name">Column</span>
        <span className="tui-tgc">Show</span>
        <span className="tui-tgc">Pivot</span>
        <span className="tui-tgc">Sort</span>
      </div>
      <div className="tui-colrow tui-allrow">
        <span className="tui-grip" />
        <span className="tui-typeicon" />
        <span className="tui-colname tui-strong">
          All{" "}
          <span className="tui-dim tui-allcount">
            · {nShown} of {total} shown
          </span>
        </span>
        <span className="tui-tgc">
          <Box
            label="Show all columns"
            on={allShown ? true : noneShown ? false : "mixed"}
            title={allShown ? "Hide every column" : "Show every column"}
            onClick={() => actions.setColumnOrder(allShown ? [] : order, stateRef)}
          >
            {allShown ? (
              <Check size={11} strokeWidth={2.4} />
            ) : noneShown ? null : (
              <Minus size={10} strokeWidth={2.6} />
            )}
          </Box>
        </span>
        <span className="tui-tgc" />
        <span className="tui-tgc" />
      </div>
      <div className="tui-vs-scroll" role="list" aria-label="Columns">
        <SortableContext items={columns.map((c) => dragId("col", c))} strategy={strategy}>
          {columns.map((c) => (
            <LayoutRow
              key={c}
              column={c}
              schema={schema}
              viewParams={viewParams}
              stateRef={stateRef}
              reorderable={canReorder(c)}
            />
          ))}
        </SortableContext>
        {columns.length === 0 ? <NoMatches /> : null}
      </div>
    </>
  );
};

const NoMatches: React.FC = () => (
  <div className="tui-hint" style={{ padding: "8px 4px" }}>
    No columns match
  </div>
);

const LayoutRow: React.FC<{
  column: string;
  schema: Schema;
  viewParams: ViewParams;
  stateRef: StateRef<AppState>;
  reorderable: boolean;
}> = ({ column, schema, viewParams, stateRef, reorderable }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId("col", column),
  });
  const name = schema.displayName(column);
  const shown = viewParams.displayColumns.includes(column);
  const pivotIdx = viewParams.vpivots.indexOf(column);
  const sortKey = viewParams.sortKey;
  const sortIdx = sortKey.findIndex(([c]) => c === column);
  const sortAsc = sortIdx >= 0 ? sortKey[sortIdx][1] : null;
  // Sort cycles: ascending, descending, off.
  const cycleSort = () => {
    if (sortAsc === true) {
      actions.setSortDir(column, false, stateRef);
    } else {
      actions.toggleSort(column, stateRef);
    }
  };
  return (
    <div
      ref={setNodeRef}
      role="listitem"
      className={
        "tui-colrow" + (shown ? "" : " tui-hidden") + (isDragging ? " tui-dragging" : "")
      }
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-column={column}
    >
      <span
        className="tui-grip"
        {...attributes}
        {...listeners}
        aria-label={
          reorderable
            ? `Move ${name} (drag, or Space and the arrow keys)`
            : `Drag ${name} onto Pivot or Sort`
        }
        aria-roledescription="sortable"
        title={reorderable ? "Drag to reorder" : "Drag onto Pivot or Sort"}
      >
        <Grip />
      </span>
      <TypeIcon schema={schema} column={column} />
      <span className="tui-colname" title={name}>
        {name}
      </span>
      <span className="tui-tgc">
        <Box
          label={`Show ${name}`}
          on={shown}
          onClick={() => actions.toggleShown(column, stateRef)}
        >
          {shown ? <Check size={11} strokeWidth={2.4} /> : null}
        </Box>
      </span>
      <span className="tui-tgc">
        <Box
          label={`Pivot by ${name}`}
          on={pivotIdx >= 0}
          onClick={() => actions.togglePivot(column, stateRef)}
        >
          {pivotIdx >= 0 ? pivotIdx + 1 : null}
        </Box>
      </span>
      <span className="tui-tgc">
        <Box
          label={`Sort by ${name}`}
          wide
          on={sortIdx >= 0}
          title={
            sortAsc === null
              ? `Sort by ${name}`
              : sortAsc
              ? "Ascending: click for descending"
              : "Descending: click to stop sorting"
          }
          onClick={cycleSort}
        >
          {sortIdx >= 0 && sortKey.length > 1 ? sortIdx + 1 : null}
          {sortAsc === true ? (
            <ArrowUp size={9} strokeWidth={2.6} />
          ) : sortAsc === false ? (
            <ArrowDown size={9} strokeWidth={2.6} />
          ) : null}
        </Box>
      </span>
    </div>
  );
};

// --- Aggregation: each column's aggregation function ---

const AggregationList: React.FC<{
  schema: Schema;
  viewParams: ViewParams;
  stateRef: StateRef<AppState>;
  columns: string[];
}> = ({ schema, viewParams, stateRef, columns }) => (
  <>
    <div className="tui-mhead" aria-hidden="true">
      <span className="tui-mhead-name">Column</span>
      <span className="tui-mhead-agg">In pivot rows</span>
    </div>
    <div className="tui-vs-scroll" role="list" aria-label="Aggregations">
      {columns.map((c) => {
        const ct = schema.columnType(c);
        const agg = viewParams.getAggFn(schema, c);
        const changed = agg !== defaultAggFn(ct);
        const name = schema.displayName(c);
        return (
          <div key={c} role="listitem" className="tui-colrow" data-column={c}>
            <span className="tui-grip" />
            <TypeIcon schema={schema} column={c} />
            <span className="tui-colname" title={name}>
              {name}
            </span>
            <span className="tui-aggwrap">
              <select
                className={"tui-aggsel" + (changed ? " tui-changed" : "")}
                value={agg}
                aria-label={`Aggregate ${name} with`}
                onChange={(e) => actions.setAggFn(c, e.target.value as AggFn, stateRef)}
              >
                {aggChoices(ct).map((fn) => (
                  <option key={fn} value={fn}>
                    {aggLabel(fn)}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} strokeWidth={1.7} />
            </span>
          </div>
        );
      })}
      {columns.length === 0 ? <NoMatches /> : null}
    </div>
    <div className="tui-hint">Shown in pivot rows and the totals row. Blue: changed from the default.</div>
  </>
);

// --- Format: the defaults, and each column's format ---

const DEFAULT_KINDS: ColumnKind[] = ["integer", "real", "string"];

const isNumericKind = (kind: ColumnKind) => kind === "integer" || kind === "real";

const FormatList: React.FC<{
  viewState: ViewState;
  stateRef: StateRef<AppState>;
  columns: string[];
  showDefaults: boolean;
}> = ({ viewState, stateRef, columns, showDefaults }) => {
  const { baseSchema: schema, viewParams } = viewState;
  const [open, setOpen] = useState<string | null>(null);
  const rows = Array.from(loadedRows(viewState));
  const kindOf = (column: string) => schema.columnType(column).kind as ColumnKind;
  /** The largest loaded value of a number column (which shows the most of its format). */
  const largest = (column: string): number | bigint | null => {
    let max: number | bigint | null = null;
    for (const r of rows) {
      const v = r?.[column];
      if ((typeof v === "number" || typeof v === "bigint") && (max === null || v > max)) {
        max = v;
      }
    }
    return max;
  };
  /**
   * Sample values for a default's editor: those of the column the row's
   * example comes from (for numbers, the one with the largest value), or else
   * of the first column of the kind that has some loaded.
   */
  const kindSamples = (kind: ColumnKind): any[] => {
    const columns = schema.columns.filter((c) => kindOf(c) === kind);
    let best: string | null = null;
    let bestMax: number | bigint | null = null;
    if (isNumericKind(kind)) {
      for (const c of columns) {
        const m = largest(c);
        if (m !== null && (bestMax === null || m > bestMax)) {
          best = c;
          bestMax = m;
        }
      }
    }
    for (const c of best ? [best, ...columns] : columns) {
      const vs = sampleValues(rows, c);
      if (vs.length > 0) {
        return vs;
      }
    }
    return [];
  };
  /** The example a row shows: a number in its format, or what the text format does. */
  const example = (target: FormatTarget): string => {
    const opts = editableFormat(target, viewParams, schema);
    const kind = "column" in target ? kindOf(target.column) : target.kind;
    if (opts && !isNumericKind(kind)) {
      return (opts as any).urlsAsHyperlinks ? "URLs as links" : "Plain text";
    }
    let v: any;
    if ("column" in target) {
      v = isNumericKind(kind) ? largest(target.column) : sampleValues(rows, target.column)[0];
    } else {
      const maxes = schema.columns
        .filter((c) => kindOf(c) === kind)
        .map(largest)
        .filter((m) => m !== null) as (number | bigint)[];
      v =
        maxes.length > 0
          ? maxes.reduce((a, b) => (b > a ? b : a))
          : FALLBACK_SAMPLES[kind]?.[2];
    }
    if (v == null) {
      return "";
    }
    const s = opts ? opts.getFormatter()(v) ?? "" : String(v);
    return s.startsWith("<a ") ? String(v) : s;
  };
  const row = (key: string, target: FormatTarget, label: string, own: boolean) => {
    const isDefault = !("column" in target);
    const editable = editableFormat(target, viewParams, schema) !== null;
    const value = example(target);
    const button = (
      <button
        type="button"
        className={"tui-fmtbtn" + (own || isDefault ? " tui-set" : "")}
        data-format={key}
        aria-label={isDefault ? `Edit the ${label}` : `Format ${label}`}
        title={own ? "Has its own format" : undefined}
      >
        {own ? <span className="tui-owndot" aria-label="(own format)" /> : null}
        <span className="tui-fmtsample">{value}</span>
      </button>
    );
    return (
      <div
        key={key}
        role="listitem"
        className="tui-colrow"
        data-column={isDefault ? undefined : (target as { column: string }).column}
      >
        <span className="tui-grip" />
        <span className="tui-typeicon" aria-hidden="true">
          {typeIcon(isDefault ? (target as { kind: ColumnKind }).kind : kindOf((target as any).column))}
        </span>
        <span className={"tui-colname" + (isDefault ? " tui-strong" : "")} title={label}>
          {label}
        </span>
        {!editable ? (
          <span className="tui-fmtbtn tui-static">
            <span className="tui-fmtsample">{value}</span>
          </span>
        ) : (
          <Popover.Root open={open === key} onOpenChange={(o) => setOpen(o ? key : null)}>
            <Popover.Trigger asChild>{button}</Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="tad-ui tui-pop tui-fmtpop"
                side="right"
                align="start"
                sideOffset={8}
                collisionPadding={8}
              >
                <FormatEditor
                  target={target}
                  viewParams={viewParams}
                  schema={schema}
                  stateRef={stateRef}
                  samples={
                    "column" in target
                      ? sampleValues(rows, target.column)
                      : kindSamples(target.kind)
                  }
                  onClose={() => setOpen(null)}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    );
  };
  return (
    <>
      <div className="tui-mhead" aria-hidden="true">
        <span className="tui-mhead-name">Column</span>
        <span className="tui-mhead-example">Example</span>
      </div>
      {showDefaults ? (
        <div className="tui-defs" role="list" aria-label="Default formats">
          {DEFAULT_KINDS.map((kind) =>
            row("default:" + kind, { kind }, `${kindName(kind)} default`, false)
          )}
        </div>
      ) : null}
      <div className="tui-vs-scroll" role="list" aria-label="Formats">
        {columns.map((c) =>
          row("column:" + c, { column: c }, schema.displayName(c), viewParams.columnFormats.has(c))
        )}
        {columns.length === 0 ? <NoMatches /> : null}
      </div>
      <div className="tui-hint tui-dothint">
        <span className="tui-owndot" />
        has its own format; the rest use their type's default
      </div>
    </>
  );
};
