/*
 * The new UI's view settings sidebar: the Pivot and Sort shelves, the
 * column list (Layout, Aggregation and Format modes), and Options.
 */
import * as React from "react";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StateRef } from "oneref";
import { AggFn, aggFns, ColumnKind, defaultAggFn, Schema } from "reltab";
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
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  Clock,
  Eye,
  GripVertical,
  ListTree,
  Search,
  Type,
} from "./icons";
import { reordered, Shelves, useDragSensors } from "./Shelves";
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

/** The column's type, as the grid's header shows it. */
const typeIcon = (kind: string): React.ReactNode => {
  switch (kind) {
    case "integer":
      return "123";
    case "real":
      return "#";
    case "boolean":
      return <Check size={11} strokeWidth={2} />;
    case "date":
      return <Calendar size={11} strokeWidth={1.8} />;
    case "time":
    case "datetime":
    case "timestamp":
      return <Clock size={11} strokeWidth={1.8} />;
    default:
      return <Type size={11} strokeWidth={1.8} />;
  }
};

const TypeIcon: React.FC<{ schema: Schema; column: string }> = ({ schema, column }) => (
  <span className="tui-typeicon" aria-hidden="true">
    {typeIcon(schema.columnType(column).kind)}
  </span>
);

export const ViewSidebar: React.FC<ViewSidebarProps> = ({ expanded, viewState, stateRef }) => {
  const { baseSchema: schema, viewParams } = viewState;
  const [mode, setMode] = useState<Mode>("layout");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const order = columnOrder(schema, viewParams);
  const matching =
    q === "" ? order : order.filter((c) => schema.displayName(c).toLowerCase().includes(q));
  const pivoted = viewParams.vpivots.length > 0;
  return (
    <aside
      className={
        "sidebar tad-ui tui-sidebar " + (expanded ? "sidebar-expanded" : "sidebar-collapsed")
      }
      aria-label="View settings"
    >
      <div className="sidebar-content">
        <div className="tui-sidebar-inner">
          <Shelves schema={schema} viewParams={viewParams} stateRef={stateRef} />

          <section className="tui-sb-section" aria-label="Columns">
            <div className="tui-sb-head">Columns</div>
            <label className="tui-search">
              <Search size={13} strokeWidth={1.8} />
              <input
                type="text"
                value={search}
                placeholder={`Find among ${schema.columns.length} columns`}
                aria-label="Find a column"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="tui-seg tui-wide" role="group" aria-label="Column list shows">
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
            {mode === "layout" ? (
              <LayoutList
                schema={schema}
                viewParams={viewParams}
                stateRef={stateRef}
                columns={matching}
                draggable={q === ""}
                order={order}
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
            {matching.length === 0 ? (
              <div className="tui-hint" style={{ padding: "6px 4px" }}>
                No columns match
              </div>
            ) : null}
          </section>

          <section className="tui-sb-section" aria-label="Options">
            <div className="tui-sb-head">Options</div>
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
            <div className="tui-frow tui-sb-option">
              <span className={pivoted ? undefined : "tui-dim"}>Label leaf rows with</span>
              <select
                className="tui-select"
                value={viewParams.pivotLeafColumn ?? ""}
                disabled={!pivoted}
                title={pivoted ? undefined : "For pivoted views"}
                aria-label="Label leaf rows with"
                onChange={(e) => actions.setPivotLeafColumn(e.target.value || null, stateRef)}
              >
                <option value="">Nothing</option>
                {schema.columns.map((c) => (
                  <option key={c} value={c}>
                    {schema.displayName(c)}
                  </option>
                ))}
              </select>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
};

// --- Layout: show, pivot and sort toggles; drag to reorder ---

/** A toggle: a pale blue tint with a dark blue mark when on. */
const Toggle: React.FC<{
  label: string;
  on: boolean | "mixed";
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, on, title, onClick, children }) => (
  <button
    type="button"
    className="tui-tog"
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
  /** Whether rows can be dragged (not while searching). */
  draggable: boolean;
  order: string[];
}> = ({ schema, viewParams, stateRef, columns, draggable, order }) => {
  const sensors = useDragSensors();
  const shown = viewParams.displayColumns;
  const allShown = shown.length === schema.columns.length;
  const noneShown = shown.length === 0;
  return (
    <div className="tui-collist" role="list" aria-label="Columns">
      <div className="tui-colrow tui-allrow">
        <span className="tui-grip" />
        <span className="tui-colname">All columns</span>
        <Toggle
          label="Show all columns"
          on={allShown ? true : noneShown ? false : "mixed"}
          title={allShown ? "Hide every column" : "Show every column"}
          onClick={() => actions.setColumnOrder(allShown ? [] : order, stateRef)}
        >
          <Eye size={13} strokeWidth={1.8} />
        </Toggle>
        <span className="tui-tog-space" />
        <span className="tui-tog-space" />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => {
          const next = reordered(shown, e);
          if (next) {
            actions.setColumnOrder(next, stateRef);
          }
        }}
      >
        <SortableContext items={draggable ? shown : []} strategy={verticalListSortingStrategy}>
          {columns.map((c) => (
            <LayoutRow
              key={c}
              column={c}
              schema={schema}
              viewParams={viewParams}
              stateRef={stateRef}
              draggable={draggable && shown.includes(c)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};

const LayoutRow: React.FC<{
  column: string;
  schema: Schema;
  viewParams: ViewParams;
  stateRef: StateRef<AppState>;
  draggable: boolean;
}> = ({ column, schema, viewParams, stateRef, draggable }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column,
    disabled: !draggable,
  });
  const name = schema.displayName(column);
  const shown = viewParams.displayColumns.includes(column);
  const pivots = viewParams.vpivots;
  const pivotIdx = pivots.indexOf(column);
  const sortKey = viewParams.sortKey;
  const sortIdx = sortKey.findIndex(([c]) => c === column);
  const sortAsc = sortIdx >= 0 ? sortKey[sortIdx][1] : null;
  // Sort cycles: ascending, descending, off.
  const cycleSort = () => {
    if (sortAsc === null) {
      actions.toggleSort(column, stateRef);
    } else if (sortAsc) {
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
      {draggable ? (
        <span
          className="tui-grip"
          {...attributes}
          {...listeners}
          aria-label={`Move ${name} (drag, or Space and the arrow keys)`}
          aria-roledescription="sortable"
        >
          <GripVertical size={12} strokeWidth={1.8} />
        </span>
      ) : (
        <span className="tui-grip" />
      )}
      <TypeIcon schema={schema} column={column} />
      <span className="tui-colname" title={name}>
        {name}
      </span>
      <Toggle
        label={`Show ${name}`}
        on={shown}
        onClick={() => actions.toggleShown(column, stateRef)}
      >
        <Eye size={13} strokeWidth={1.8} />
      </Toggle>
      <Toggle
        label={`Pivot by ${name}`}
        on={pivotIdx >= 0}
        onClick={() => actions.togglePivot(column, stateRef)}
      >
        {pivotIdx >= 0 && pivots.length > 1 ? (
          <span className="tui-tog-num">{pivotIdx + 1}</span>
        ) : (
          <ListTree size={13} strokeWidth={1.8} />
        )}
      </Toggle>
      <Toggle
        label={`Sort by ${name}`}
        on={sortIdx >= 0}
        title={
          sortAsc === null
            ? `Sort by ${name}`
            : sortAsc
            ? "Ascending (click for descending)"
            : "Descending (click to stop sorting)"
        }
        onClick={cycleSort}
      >
        {sortAsc === false ? (
          <ArrowDown size={12} strokeWidth={2} />
        ) : (
          <ArrowUp size={12} strokeWidth={sortAsc ? 2 : 1.8} />
        )}
        {sortIdx >= 0 && sortKey.length > 1 ? (
          <span className="tui-tog-num tui-small">{sortIdx + 1}</span>
        ) : null}
      </Toggle>
    </div>
  );
};

// --- Aggregation: each column's aggregation function ---

const aggLabel = (fn: AggFn) => (fn === "null" ? "none" : fn);

const AggregationList: React.FC<{
  schema: Schema;
  viewParams: ViewParams;
  stateRef: StateRef<AppState>;
  columns: string[];
}> = ({ schema, viewParams, stateRef, columns }) => (
  <div className="tui-collist" role="list" aria-label="Aggregations">
    {columns.map((c) => {
      const ct = schema.columnType(c);
      const agg = viewParams.getAggFn(schema, c);
      const changed = agg !== defaultAggFn(ct);
      const name = schema.displayName(c);
      return (
        <div key={c} role="listitem" className="tui-colrow" data-column={c}>
          <TypeIcon schema={schema} column={c} />
          <span className="tui-colname" title={name}>
            {name}
          </span>
          <select
            className={"tui-select tui-aggselect" + (changed ? " tui-changed" : "")}
            value={agg}
            aria-label={`Aggregate ${name} with`}
            onChange={(e) => actions.setAggFn(c, e.target.value as AggFn, stateRef)}
          >
            {aggFns(ct).map((fn) => (
              <option key={fn} value={fn}>
                {aggLabel(fn)}
              </option>
            ))}
          </select>
        </div>
      );
    })}
  </div>
);

// --- Format: the defaults, and each column's format ---

const DEFAULT_KINDS: ColumnKind[] = ["integer", "real", "string"];

const FormatList: React.FC<{
  viewState: ViewState;
  stateRef: StateRef<AppState>;
  columns: string[];
  showDefaults: boolean;
}> = ({ viewState, stateRef, columns, showDefaults }) => {
  const { baseSchema: schema, viewParams } = viewState;
  const [open, setOpen] = useState<string | null>(null);
  const rows = Array.from(loadedRows(viewState));
  const sample = (column: string) => sampleValues(rows, column)[0];
  const kindColumns = (kind: ColumnKind) =>
    schema.columns.filter((c) => schema.columnType(c).kind === kind);
  /** Values of the first column of a kind that has some loaded. */
  const kindSamples = (kind: ColumnKind): any[] => {
    for (const c of kindColumns(kind)) {
      const vs = sampleValues(rows, c);
      if (vs.length > 0) {
        return vs;
      }
    }
    return [];
  };
  const kindSample = (kind: ColumnKind) =>
    kindSamples(kind)[0] ?? FALLBACK_SAMPLES[kind]?.[kind === "string" ? 0 : 2] ?? null;
  const show = (target: FormatTarget, v: any): string => {
    const opts = editableFormat(target, viewParams, schema);
    if (v == null) {
      return "";
    }
    const s = opts ? opts.getFormatter()(v) ?? "" : String(v);
    return s.startsWith("<a ") ? String(v) : s;
  };
  const row = (key: string, target: FormatTarget, label: React.ReactNode, value: string, own: boolean) => {
    const editable = editableFormat(target, viewParams, schema) !== null;
    const content = (
      <>
        {"column" in target ? <TypeIcon schema={schema} column={target.column} /> : null}
        <span className="tui-colname">{label}</span>
        {own ? <span className="tui-owndot" title="Has its own format" aria-label="(own format)" /> : null}
        <span className="tui-fmtsample">{value}</span>
      </>
    );
    if (!editable) {
      return (
        <div key={key} role="listitem" className="tui-colrow tui-static">
          {content}
        </div>
      );
    }
    return (
      <Popover.Root key={key} open={open === key} onOpenChange={(o) => setOpen(o ? key : null)}>
        <Popover.Trigger asChild>
          <button
            type="button"
            role="listitem"
            className="tui-colrow tui-fmtrow"
            data-format={key}
          >
            {content}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="tad-ui tui-pop"
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
                "column" in target ? sampleValues(rows, target.column) : kindSamples(target.kind)
              }
              onClose={() => setOpen(null)}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  };
  return (
    <div className="tui-collist" role="list" aria-label="Formats">
      {showDefaults ? (
        <>
          {DEFAULT_KINDS.map((kind) =>
            row(
              "default:" + kind,
              { kind },
              <>
                {kindName(kind)} <span className="tui-dim">default</span>
              </>,
              show({ kind }, kindSample(kind)),
              false
            )
          )}
          <div className="tui-sep" />
        </>
      ) : null}
      {columns.map((c) =>
        row(
          "column:" + c,
          { column: c },
          schema.displayName(c),
          show({ column: c }, sample(c)),
          viewParams.columnFormats.has(c)
        )
      )}
    </div>
  );
};
