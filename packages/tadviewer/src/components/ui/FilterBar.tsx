/*
 * The filter bar, below the grid (in place of the old footer): a chip per
 * condition, All/Any, + Filter, Clear all, and the row counts.
 *
 * Changes apply as they're made, after a short delay. Esc in a chip's
 * popover puts the filter back as it was when the popover opened.
 */
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { FilterGlyph } from "./glyphs";
import { Plus, Search, X } from "./icons";
import { typeIcon } from "./typeIcon";
import { StateRef } from "oneref";
import { colIsNumeric, FilterExp, Schema } from "reltab";
import * as actions from "../../actions";
import { AppState } from "../../AppState";
import {
  Chip,
  chipsToFilterExp,
  chipSummary,
  filterExpToChips,
  isActive,
  Match,
  newChip,
} from "../../filterChips";
import { onColumnFilterRequest } from "../../uiEvents";
import { ChipEditor, ChipEditorContext } from "./ChipEditor";
import "./ui.css";

/** How long to wait after a change before filtering (ms). */
const APPLY_DELAY_MS = 300;

interface BarChip {
  id: number;
  chip: Chip;
}

interface BarState {
  match: Match;
  chips: BarChip[];
}

export interface FilterBarProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  onFilter?: (filterExp: FilterExp) => void;
  rightFooterSlot?: JSX.Element;
}

let nextChipId = 1;
const withIds = (chips: Chip[]): BarChip[] => chips.map((chip) => ({ id: nextChipId++, chip }));

const toFilterExp = (st: BarState): FilterExp =>
  chipsToFilterExp({ match: st.match, chips: st.chips.map((c) => c.chip) });

const load = (fe: FilterExp, schema: Schema): BarState => {
  const { match, chips } = filterExpToChips(fe, schema);
  return { match, chips: withIds(chips) };
};

const fmtCount = (n: number) => n.toLocaleString(undefined, { useGrouping: true });

export const FilterBar: React.FC<FilterBarProps> = ({
  appState,
  stateRef,
  onFilter,
  rightFooterSlot,
}) => {
  const viewState = appState.viewState;
  const schema = viewState.baseSchema;
  const viewParams = viewState.viewParams;
  const filterExp = viewParams.filterExp;
  const feKey = JSON.stringify(filterExp);

  const [bar, setBarState] = useState<BarState>(() => load(filterExp, schema));
  const latest = useRef(bar);
  // The filter the view has, as far as the bar knows (JSON):
  const applied = useRef(feKey);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  // The bar as it was when the open popover opened, for Esc:
  const beforeOpen = useRef<BarState | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const cancelPending = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const applyNow = () => {
    cancelPending();
    const fe = toFilterExp(latest.current);
    const key = JSON.stringify(fe);
    if (key !== applied.current) {
      applied.current = key;
      actions.setFilter(fe, stateRef);
      onFilter?.(fe);
    }
  };

  const setBar = (next: BarState, when: "later" | "now" = "later") => {
    latest.current = next;
    setBarState(next);
    cancelPending();
    if (when === "now") {
      applyNow();
    } else {
      timer.current = setTimeout(applyNow, APPLY_DELAY_MS);
    }
  };

  // The filter changed elsewhere (a histogram brush, opening a view...):
  useEffect(() => {
    if (feKey !== applied.current) {
      cancelPending();
      applied.current = feKey;
      const next = load(filterExp, schema);
      latest.current = next;
      setBarState(next);
      setOpenId(null);
    }
  }, [feKey]);

  useEffect(() => cancelPending, []);

  const updateChip = (id: number, chip: Chip) =>
    setBar({
      ...latest.current,
      chips: latest.current.chips.map((c) => (c.id === id ? { id, chip } : c)),
    });

  const removeChip = (id: number) => {
    if (openId === id) {
      setOpenId(null);
    }
    setBar({ ...latest.current, chips: latest.current.chips.filter((c) => c.id !== id) }, "now");
  };

  const openChip = (id: number | null) => {
    if (openId !== null && id === null) {
      // Closing: apply any change straight away.
      applyNow();
    }
    beforeOpen.current = id === null ? null : latest.current;
    setOpenId(id);
  };

  const revert = () => {
    if (beforeOpen.current) {
      setBar(beforeOpen.current, "now");
    }
  };

  const addFilter = (column: string) => {
    const chip = newChip(column, schema.columnType(column));
    const [bc] = withIds([chip]);
    // (Esc in the new chip's popover removes it.)
    const before = latest.current;
    setBar({ ...latest.current, chips: [...latest.current.chips, bc] });
    setAddOpen(false);
    // Open the new chip's popover once the column list has closed:
    setTimeout(() => {
      beforeOpen.current = before;
      setOpenId(bc.id);
    }, 0);
  };

  // "Filter…" in a column's header menu: open the column's chip, or add one.
  const filterRequest = useRef<(column: string) => void>();
  filterRequest.current = (column: string) => {
    const existing = latest.current.chips.find((c) => c.chip.column === column);
    if (existing) {
      openChip(existing.id);
    } else {
      addFilter(column);
    }
  };
  useEffect(
    () => onColumnFilterRequest((column) => setTimeout(() => filterRequest.current?.(column), 0)),
    []
  );

  const editorContext = (id: number, column: string | null): ChipEditorContext => {
    const others = chipsToFilterExp({
      match: bar.match,
      chips: bar.chips.filter((c) => c.id !== id).map((c) => c.chip),
    });
    const formatter =
      column && colIsNumeric(schema.columnType(column))
        ? viewParams.getColumnFormatter(schema, column)
        : null;
    return {
      dbc: viewState.dbc,
      baseQuery: viewState.baseQuery,
      schema,
      others: others.opArgs.length > 0 ? others : null,
      fmt: (n: number) => (formatter ? formatter(n) ?? String(n) : String(n)),
    };
  };

  const chipLabel = (chip: Chip) => (chip.column ? schema.displayName(chip.column) : "");

  return (
    <div className="tad-ui tui-filterbar" role="toolbar" aria-label="Filter">
      <span className="tui-filterbar-icon" title="Filters">
        <FilterGlyph />
      </span>
      {bar.chips.length > 1 ? (
        <div className="tui-seg" role="group" aria-label="Rows must match">
          {(["AND", "OR"] as Match[]).map((m) => (
            <button
              key={m}
              type="button"
              className="tui-segb"
              aria-pressed={bar.match === m}
              title={m === "AND" ? "Rows must match all the filters" : "Rows must match any filter"}
              onClick={() => setBar({ ...latest.current, match: m }, "now")}
            >
              {m === "AND" ? "All" : "Any"}
            </button>
          ))}
        </div>
      ) : null}
      {bar.chips.map(({ id, chip }) => {
        const label = chipLabel(chip);
        const fmt = editorContext(id, chip.column).fmt;
        const summary = chipSummary(chip, fmt);
        const open = openId === id;
        const cls =
          "tui-chip" +
          (chip.kind === "fixed" ? " tui-fixed" : "") +
          (!isActive(chip) ? " tui-idle" : "") +
          (open ? " tui-open" : "");
        return (
          <Popover.Root key={id} open={open} onOpenChange={(o) => openChip(o ? id : null)}>
            <div className={cls} data-column={chip.column ?? undefined}>
              <Popover.Trigger asChild>
                <button type="button" className="tui-chipmain">
                  {label ? <span className="tui-chipname">{label}</span> : null}
                  <span className="tui-chipval">{summary}</span>
                </button>
              </Popover.Trigger>
              <button
                type="button"
                className="tui-iconbtn"
                aria-label={`Remove the ${label || "condition"} filter`}
                onClick={() => removeChip(id)}
              >
                <X size={12} strokeWidth={1.8} />
              </button>
            </div>
            <Popover.Portal>
              <Popover.Content
                className="tad-ui tui-pop"
                side="top"
                align="start"
                sideOffset={8}
                collisionPadding={8}
                aria-label={`Filter ${label}`}
                onEscapeKeyDown={() => revert()}
              >
                <ChipEditor
                  chip={chip}
                  context={editorContext(id, chip.column)}
                  onChange={(c) => updateChip(id, c)}
                  onRemove={() => removeChip(id)}
                  onClose={() => openChip(null)}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        );
      })}
      <AddFilter
        schema={schema}
        filtered={bar.chips.map((c) => c.chip.column)}
        open={addOpen}
        onOpenChange={setAddOpen}
        onPick={addFilter}
      />
      {bar.chips.length > 0 ? (
        <button
          type="button"
          className="tui-link"
          style={{ marginLeft: 2 }}
          onClick={() => {
            setOpenId(null);
            setBar({ ...latest.current, chips: [] }, "now");
          }}
        >
          Clear all
        </button>
      ) : null}
      <div className="tui-filterbar-right">
        <RowCounts appState={appState} />
        {rightFooterSlot}
      </div>
    </div>
  );
};

/** "+ Filter": pick a column to filter by. */
const AddFilter: React.FC<{
  schema: Schema;
  /** The columns that already have a chip. */
  filtered: (string | null)[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (column: string) => void;
}> = ({ schema, filtered, open, onOpenChange, onPick }) => {
  const [search, setSearch] = useState("");
  // Picking a column opens its chip's popover, which takes the focus; so the
  // list mustn't give the focus back to "+ Filter" as it closes:
  const picked = useRef(false);
  const pick = (column: string) => {
    picked.current = true;
    onPick(column);
  };
  const q = search.trim().toLowerCase();
  const columns = schema.columns.filter(
    (c) => q === "" || schema.displayName(c).toLowerCase().includes(q)
  );
  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setSearch("");
        onOpenChange(o);
      }}
    >
      <Popover.Trigger asChild>
        <button type="button" className="tui-addbtn">
          <Plus size={13} strokeWidth={2} />
          <span>Filter</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="tad-ui tui-pop tui-narrow"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          aria-label="Filter by column"
          onCloseAutoFocus={(e) => {
            if (picked.current) {
              e.preventDefault();
              picked.current = false;
            }
          }}
        >
          <div className="tui-poph">
            <span className="tui-poph-title">Filter by column</span>
          </div>
          <label className="tui-search">
            <Search size={13} strokeWidth={1.8} />
            <input
              type="text"
              value={search}
              autoFocus
              placeholder="Find a column"
              aria-label="Find a column to filter"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && columns.length > 0) {
                  pick(columns[0]);
                }
              }}
            />
          </label>
          <div className="tui-vlist" role="menu">
            {columns.map((c) => (
              <button
                key={c}
                type="button"
                role="menuitem"
                className="tui-mi"
                data-column={c}
                onClick={() => pick(c)}
              >
                <span className="tui-typeicon" aria-hidden="true">
                  {typeIcon(schema.columnType(c).kind)}
                </span>
                <span>{schema.displayName(c)}</span>
                {filtered.includes(c) ? <span className="tui-mi-aside">filtered</span> : null}
              </button>
            ))}
            {columns.length === 0 ? (
              <div className="tui-hint" style={{ padding: 6 }}>
                No columns match
              </div>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

/**
 * The number of rows the grid shows, and (when filtered or pivoted) how many
 * pass the filter, of how many. The first number is always the grid's.
 */
const RowCounts: React.FC<{ appState: AppState }> = ({ appState }) => {
  const queryView = appState.viewState.queryView;
  if (!queryView) {
    return null;
  }
  const { rowCount, baseRowCount, filterRowCount } = queryView;
  const pivoted = filterRowCount !== rowCount;
  const filtered = filterRowCount !== baseRowCount;
  const rows = (n: number) => (n === 1 ? "row" : "rows");
  let rest: string;
  if (!pivoted) {
    rest = filtered ? ` of ${fmtCount(baseRowCount)} ${rows(baseRowCount)}` : ` ${rows(rowCount)}`;
  } else {
    rest =
      ` ${rows(rowCount)}, from ` +
      (filtered
        ? `${fmtCount(filterRowCount)} of ${fmtCount(baseRowCount)}`
        : fmtCount(baseRowCount));
  }
  return (
    <span className="footer-value">
      <span className="tui-rows-shown">{fmtCount(rowCount)}</span>
      {rest}
    </span>
  );
};
