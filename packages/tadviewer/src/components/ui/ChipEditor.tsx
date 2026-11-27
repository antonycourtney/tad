/*
 * The popover for a filter chip: pick values or match text (text columns),
 * a range (number columns), or a fixed condition from an older view.
 */
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import log from "loglevel";
import { Check, Minus, Search, X } from "./icons";
import { typeIcon } from "./typeIcon";
import {
  and,
  col,
  DataSourceConnection,
  FilterExp,
  getDefaultDialect,
  QueryExp,
  Schema,
  SubExp,
} from "reltab";
import {
  Chip,
  chipToSubExp,
  FixedChip,
  isNegativeMatch,
  MatchOp,
  RangeChip,
  RangeOp,
  TextChip,
} from "../../filterChips";
import {
  countRows,
  getCountsFor,
  getNumberSummary,
  getValueCounts,
  NumberSummary,
  ValueCount,
  ValueCounts,
  VALUE_LIMIT,
} from "../../filterQueries";

export interface ChipEditorContext {
  dbc: DataSourceConnection;
  baseQuery: QueryExp;
  schema: Schema;
  /** The other chips' filter (null if there are none), for counts. */
  others: FilterExp | null;
  /** Formats a number for the chip's column. */
  fmt: (n: number) => string;
}

export interface ChipEditorProps {
  chip: Chip;
  context: ChipEditorContext;
  onChange: (chip: Chip) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Run a query when its inputs change (after `delay` ms), keeping the last result. */
function useQueryResult<T>(run: () => Promise<T>, deps: any[], delay = 0): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      run().then(
        (d) => live && setData(d),
        (err) => log.warn("filter bar query failed: ", err)
      );
    }, delay);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, deps);
  return data;
}

const fmtCount = (n: number) => n.toLocaleString();

/** "N of M rows pass", for the popover's footer. */
function usePassingSummary(chip: Chip, context: ChipEditorContext): string {
  const exp = chipToSubExp(chip);
  const { dbc, baseQuery, others } = context;
  const res = useQueryResult(
    async () => {
      const passFe = new FilterExp("AND", [
        ...(others ? [others] : []),
        ...(exp ? [exp] : []),
      ]);
      const [passing, total] = await Promise.all([
        countRows(dbc, baseQuery, passFe),
        countRows(dbc, baseQuery, others),
      ]);
      return { passing, total };
    },
    [JSON.stringify(exp), JSON.stringify(others), baseQuery],
    150
  );
  return res ? `${fmtCount(res.passing)} of ${fmtCount(res.total)} rows pass` : "";
}

/** The kind of the chip's column, if it has one. */
const chipKind = (chip: Chip, context: { schema: Schema }): string | null =>
  chip.column ? context.schema.columnType(chip.column).kind : null;

const Box: React.FC<{ on: boolean; mixed?: boolean }> = ({ on, mixed }) => (
  <span className={"tui-box" + (on ? " tui-on" : mixed ? " tui-mixed" : "")}>
    {on ? (
      <Check size={10} strokeWidth={3} />
    ) : mixed ? (
      <Minus size={10} strokeWidth={3} />
    ) : null}
  </span>
);

const ValueLabel: React.FC<{ value: string | null }> = ({ value }) =>
  value === null ? (
    <span className="tui-vlabel tui-null">NULL</span>
  ) : (
    <span className="tui-vlabel" title={value}>
      {value === "" ? "(empty)" : value}
    </span>
  );

const Bar: React.FC<{ count: number; max: number }> = ({ count, max }) => (
  <span className="tui-vbar" aria-hidden="true">
    <span style={{ width: `${max > 0 ? Math.round((count / max) * 100) : 0}%` }} />
  </span>
);

const NullRow: React.FC<{ on: boolean; count: number | null; onToggle: () => void }> = ({
  on,
  count,
  onToggle,
}) => (
  <button type="button" className="tui-vrow" aria-pressed={on} onClick={onToggle}>
    <Box on={on} />
    <span className="tui-vlabel">Also keep rows with no value (NULL)</span>
    <span className="tui-vcount">{count === null ? "" : fmtCount(count)}</span>
  </button>
);

const Header: React.FC<{
  title: string;
  /** The column's kind (for its type mark), or null for a condition on no one column. */
  kind: string | null;
  note?: string;
  onClose: () => void;
}> = ({ title, kind, note, onClose }) => (
  <div className="tui-poph">
    {kind ? (
      <span className="tui-typeicon" aria-hidden="true">
        {typeIcon(kind)}
      </span>
    ) : null}
    <span className="tui-poph-title">{title}</span>
    {note ? <span className="tui-poph-note">{note}</span> : null}
    <button
      type="button"
      className="tui-iconbtn"
      style={note ? undefined : { marginLeft: "auto" }}
      aria-label="Close"
      onClick={onClose}
    >
      <X size={12} strokeWidth={1.8} />
    </button>
  </div>
);

export const ChipEditor: React.FC<ChipEditorProps> = (props) => {
  const { chip, context } = props;
  const title = chip.column ? context.schema.displayName(chip.column) : "Condition";
  switch (chip.kind) {
    case "text":
      return <TextEditor {...props} chip={chip} title={title} />;
    case "range":
      return <RangeEditor {...props} chip={chip} title={title} />;
    case "fixed":
      return <FixedEditor {...props} chip={chip} title={title} />;
  }
};

// --- text: pick values, or match text ---

interface TextEditorProps extends ChipEditorProps {
  chip: TextChip;
  title: string;
}

const MATCH_OPTIONS: [MatchOp, string][] = [
  ["contains", "Contains"],
  ["notcontains", "Doesn't contain"],
  ["begins", "Starts with"],
  ["notbegins", "Doesn't start with"],
  ["ends", "Ends with"],
  ["notends", "Doesn't end with"],
];

const TextEditor: React.FC<TextEditorProps> = ({ chip, title, context, onChange, onClose }) => {
  const summary = usePassingSummary(chip, context);
  const isPick = chip.op === "pick";
  return (
    <>
      <Header
        title={title}
        kind={chipKind(chip, context)}
        note={isPick ? "counts with other filters" : undefined}
        onClose={onClose}
      />
      <div className="tui-section">
        <div className="tui-seg tui-wide" role="group" aria-label="How to filter">
          <button
            type="button"
            className="tui-segb"
            aria-pressed={isPick}
            onClick={() => onChange({ ...chip, op: "pick" })}
          >
            Pick values
          </button>
          <button
            type="button"
            className="tui-segb"
            aria-pressed={!isPick}
            onClick={() =>
              onChange({ ...chip, op: "match", keepNull: isNegativeMatch(chip.matchOp) })
            }
          >
            Match text
          </button>
        </div>
      </div>
      {isPick ? (
        <PickValues chip={chip} context={context} onChange={onChange} />
      ) : (
        <MatchText chip={chip} context={context} onChange={onChange} />
      )}
      <div className="tui-popf">
        <span>{summary}</span>
        <button
          type="button"
          className="tui-link"
          onClick={() =>
            onChange({ ...chip, op: "pick", mode: "exclude", values: [], text: "" })
          }
        >
          Reset
        </button>
      </div>
    </>
  );
};

const PickValues: React.FC<{
  chip: TextChip;
  context: ChipEditorContext;
  onChange: (chip: Chip) => void;
}> = ({ chip, context, onChange }) => {
  const { dbc, baseQuery, schema, others } = context;
  const [search, setSearch] = useState("");
  const q = search.trim();
  const othersKey = JSON.stringify(others);
  const counts: ValueCounts | null = useQueryResult(
    () => getValueCounts(dbc, baseQuery, schema, chip.column, others, q),
    [q, othersKey, baseQuery, chip.column],
    q === "" ? 0 : 200
  );
  const allCounts: ValueCounts | null = useQueryResult(
    () => getValueCounts(dbc, baseQuery, schema, chip.column, others, ""),
    [othersKey, baseQuery, chip.column]
  );
  const listed = useMemo(() => new Set(chip.values), [chip.values]);
  // The listed values (exceptions) that aren't among the most common, so
  // that they can still be seen and unticked:
  const missing = useMemo(() => {
    const shown = new Set((counts?.values ?? []).map((v) => v.value));
    return chip.values.filter((v) => v !== null && !shown.has(v)) as string[];
  }, [counts, chip.values]);
  const extra: ValueCount[] | null = useQueryResult(
    () => getCountsFor(dbc, baseQuery, schema, chip.column, others, q === "" ? missing : []),
    [JSON.stringify(missing), othersKey, baseQuery, q]
  );

  const checked = (v: string | null) =>
    chip.mode === "include" ? listed.has(v) : !listed.has(v);
  const setChecked = (vals: (string | null)[], on: boolean) => {
    const add = chip.mode === "include" ? on : !on;
    const next = new Set(chip.values);
    vals.forEach((v) => (add ? next.add(v) : next.delete(v)));
    onChange({ ...chip, values: [...next] });
  };

  let rows: ValueCount[] = counts?.values ?? [];
  if (q === "") {
    const extraCounts = new Map((extra ?? []).map((e) => [e.value, e.count]));
    rows = [...rows, ...missing.map((v) => ({ value: v, count: extraCounts.get(v) ?? 0 }))];
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  const keys = rows.map((r) => r.value);
  const allOn = keys.length > 0 && keys.every(checked);
  const someOn = keys.some(checked);
  const toggleAll = () => {
    if (q === "") {
      // Everything, or nothing: then tick the few to keep, or untick the
      // few to leave out.
      onChange({ ...chip, mode: allOn ? "include" : "exclude", values: [] });
    } else {
      setChecked(keys, !allOn);
    }
  };
  const distinct = allCounts?.distinct;
  const matching = counts?.distinct ?? 0;
  const moreNote =
    counts && counts.values.length < matching
      ? q === ""
        ? `Showing the ${fmtCount(counts.values.length)} most common of ${fmtCount(
            matching
          )} values. Search to find the rest.`
        : `${fmtCount(counts.values.length)} of ${fmtCount(
            matching
          )} matches shown. Refine the search to see the rest.`
      : null;

  return (
    <>
      <label className="tui-search">
        <Search size={14} strokeWidth={1.6} />
        <input
          type="text"
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            distinct !== undefined ? `Search ${fmtCount(distinct)} values` : "Search values"
          }
          aria-label="Search values"
        />
      </label>
      <button
        type="button"
        className="tui-vrow tui-master"
        aria-pressed={allOn}
        onClick={toggleAll}
      >
        <Box on={allOn} mixed={!allOn && someOn} />
        <span className="tui-vlabel" style={{ fontWeight: 500 }}>
          {q === "" ? "All values" : `All matching “${q}”`}
        </span>
        <span className="tui-vcount">{counts ? fmtCount(matching) : ""}</span>
      </button>
      <div className="tui-vlist" role="group" aria-label="Values">
        {rows.map((r) => {
          const on = checked(r.value);
          return (
            <button
              key={r.value === null ? "\u0000null" : "v:" + r.value}
              type="button"
              className={"tui-vrow" + (r.count === 0 ? " tui-zero" : "")}
              aria-pressed={on}
              data-value={r.value === null ? undefined : r.value}
              data-null={r.value === null ? "" : undefined}
              onClick={() => setChecked([r.value], !on)}
            >
              <Box on={on} />
              <ValueLabel value={r.value} />
              <Bar count={r.count} max={max} />
              <span className="tui-vcount">{fmtCount(r.count)}</span>
            </button>
          );
        })}
        {counts && rows.length === 0 ? (
          <div className="tui-hint" style={{ padding: 6 }}>
            No values match
          </div>
        ) : null}
      </div>
      {moreNote ? (
        <div className="tui-hint" style={{ padding: "6px 6px 0" }}>
          {moreNote}
        </div>
      ) : null}
    </>
  );
};

/** Whether text matches, ignoring case, as the SQL (ILIKE) will. */
const textMatches = (op: MatchOp, v: string, t: string): boolean => {
  const s = v.toLowerCase();
  const q = t.toLowerCase();
  const base = isNegativeMatch(op) ? op.slice(3) : op;
  const m = base === "contains" ? s.includes(q) : base === "begins" ? s.startsWith(q) : s.endsWith(q);
  return isNegativeMatch(op) ? !m : m;
};

const MatchText: React.FC<{
  chip: TextChip;
  context: ChipEditorContext;
  onChange: (chip: Chip) => void;
}> = ({ chip, context, onChange }) => {
  const { dbc, baseQuery, schema, others } = context;
  const text = chip.text.trim();
  const negative = isNegativeMatch(chip.matchOp);
  // Values containing the text; for the other operators, of those, the ones
  // that match:
  const counts: ValueCounts | null = useQueryResult(
    () =>
      text === "" || negative
        ? Promise.resolve({ values: [], distinct: 0 })
        : getValueCounts(dbc, baseQuery, schema, chip.column, others, text),
    [text, negative, JSON.stringify(others), baseQuery],
    200
  );
  const nullCount = useQueryResult(
    () =>
      countRows(
        dbc,
        baseQuery,
        new FilterExp("AND", [
          ...(others ? [others] : []),
          and().isNull(col(chip.column)),
        ])
      ),
    [JSON.stringify(others), baseQuery, chip.column]
  );
  const matches = (counts?.values ?? []).filter(
    (v) => v.value !== null && v.count > 0 && textMatches(chip.matchOp, v.value, text)
  );
  const max = Math.max(1, ...matches.map((m) => m.count));
  const note =
    text === ""
      ? "Type the text to match. Matching ignores case."
      : negative
      ? "Keeps rows whose value doesn't match. Matching ignores case."
      : matches.length === 0 && counts
      ? "No values match."
      : `Matching values${
          counts && counts.values.length >= VALUE_LIMIT ? " (the most common)" : ""
        }:`;
  return (
    <>
      <div className="tui-row">
        <select
          className="tui-select"
          value={chip.matchOp}
          aria-label="How to match"
          onChange={(e) => {
            const matchOp = e.target.value as MatchOp;
            onChange({ ...chip, matchOp, keepNull: isNegativeMatch(matchOp) });
          }}
        >
          {MATCH_OPTIONS.map(([op, label]) => (
            <option key={op} value={op}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="tui-input"
          type="text"
          value={chip.text}
          autoFocus
          placeholder="Text"
          aria-label="Text to match"
          onChange={(e) => onChange({ ...chip, text: e.target.value })}
        />
      </div>
      <div className="tui-hint" style={{ padding: "0 6px 6px" }}>
        {note}
      </div>
      {matches.length > 0 ? (
        <div className="tui-vlist">
          {matches.slice(0, 50).map((m) => (
            <div key={m.value!} className="tui-vrow tui-static">
              <ValueLabel value={m.value} />
              <Bar count={m.count} max={max} />
              <span className="tui-vcount">{fmtCount(m.count)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {nullCount ? (
        <NullRow
          on={chip.keepNull}
          count={nullCount}
          onToggle={() => onChange({ ...chip, keepNull: !chip.keepNull })}
        />
      ) : null}
    </>
  );
};

// --- numbers: a range ---

interface RangeEditorProps extends ChipEditorProps {
  chip: RangeChip;
  title: string;
}

const RANGE_OPTIONS: [RangeOp, string][] = [
  ["between", "is between"],
  ["outside", "is not between"],
  ["null", "is NULL"],
  ["notnull", "is not NULL"],
];

/** A number input that keeps what's typed, and reports it as a number or null. */
const NumberInput: React.FC<{
  label: string;
  value: number | null;
  placeholder: string;
  onChange: (n: number | null) => void;
}> = ({ label, value, placeholder, onChange }) => {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    // Follow changes made elsewhere (e.g. by clicking the histogram):
    const n = text.trim() === "" ? null : Number(text);
    if (n !== value) {
      setText(value === null ? "" : String(value));
    }
  }, [value]);
  return (
    <label>
      {label}
      <input
        className="tui-input"
        type="number"
        value={text}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value);
          const t = e.target.value.trim();
          const n = Number(t);
          if (t === "") {
            onChange(null);
          } else if (Number.isFinite(n)) {
            onChange(n);
          }
        }}
      />
    </label>
  );
};

const RangeEditor: React.FC<RangeEditorProps> = ({ chip, title, context, onChange, onClose }) => {
  const { dbc, baseQuery, schema, others, fmt } = context;
  const summary = usePassingSummary(chip, context);
  const [anchor, setAnchor] = useState<number | null>(null);
  const numbers: NumberSummary | null = useQueryResult(
    () => getNumberSummary(dbc, baseQuery, schema, chip.column, others),
    [JSON.stringify(others), baseQuery, chip.column]
  );
  const bounded = chip.op === "between" || chip.op === "outside";
  const hist = numbers?.histogram ?? null;
  const isInt = schema.columnType(chip.column).kind === "integer";
  // Bar i counts values from bins[i].lower up to (not including) bins[i].upper:
  const bins = hist
    ? hist.counts.map((count, i) => ({
        count,
        lower: hist.start + i * hist.binWidth,
        upper: hist.start + (i + 1) * hist.binWidth,
      }))
    : [];
  const binMax = Math.max(1, ...bins.map((b) => b.count));
  // The range a bar stands for, as (inclusive) filter bounds. Integer
  // columns' bars cover whole numbers.
  const binMin = (i: number) => bins[i].lower;
  const binTop = (i: number) => (isInt ? bins[i].upper - 1 : bins[i].upper);
  const barOn = (i: number) => {
    if (chip.min === null && chip.max === null) {
      return false;
    }
    const lo = chip.min ?? -Infinity;
    const hi = chip.max ?? Infinity;
    return chip.op === "outside"
      ? binMin(i) < lo || binTop(i) > hi
      : binMin(i) <= hi && binTop(i) >= lo;
  };
  const pickBar = (i: number) => {
    if (anchor === null) {
      setAnchor(i);
      onChange({ ...chip, min: binMin(i), max: binTop(i) });
    } else {
      const [a, b] = anchor <= i ? [anchor, i] : [i, anchor];
      setAnchor(null);
      onChange({ ...chip, min: binMin(a), max: binTop(b) });
    }
  };
  const lo = numbers?.min != null ? fmt(numbers.min) : "";
  const hi = numbers?.max != null ? fmt(numbers.max) : "";
  return (
    <>
      <Header title={title} kind={chipKind(chip, context)} onClose={onClose} />
      <div className="tui-frow">
        <span className="tui-dim">Keep rows where it</span>
        <select
          className="tui-select"
          value={chip.op}
          aria-label="Condition"
          onChange={(e) => {
            const op = e.target.value as RangeOp;
            setAnchor(null);
            onChange({ ...chip, op, keepNull: op === "outside" });
          }}
        >
          {RANGE_OPTIONS.map(([op, label]) => (
            <option key={op} value={op}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {bounded ? (
        <>
          {bins.length > 0 ? (
            <>
              <div className="tui-hint" style={{ padding: "0 6px 8px" }}>
                {anchor !== null
                  ? "Now click another bar to end the range."
                  : chip.op === "outside"
                  ? "Click a bar, then another, to pick the range to leave out."
                  : "Click a bar, then another, to pick a range."}
              </div>
              <div className="tui-hbig">
                {bins.map((b, i) => (
                  <button
                    key={i}
                    type="button"
                    className={"tui-hbar" + (barOn(i) ? " tui-on" : "")}
                    style={{ height: `${Math.max(2, Math.round((b.count / binMax) * 60))}px` }}
                    title={`${fmt(binMin(i))} – ${fmt(binTop(i))}: ${fmtCount(b.count)} rows`}
                    aria-label={`${fmt(binMin(i))} to ${fmt(binTop(i))}, ${fmtCount(b.count)} rows`}
                    onClick={() => pickBar(i)}
                  />
                ))}
              </div>
              <div className="tui-haxis">
                <span>{lo}</span>
                <span>{hi}</span>
              </div>
            </>
          ) : null}
          <div className="tui-range">
            <NumberInput
              label="Min"
              value={chip.min}
              placeholder={lo}
              onChange={(min) => onChange({ ...chip, min })}
            />
            <NumberInput
              label="Max"
              value={chip.max}
              placeholder={hi}
              onChange={(max) => onChange({ ...chip, max })}
            />
          </div>
          {numbers && numbers.nullCount > 0 ? (
            <NullRow
              on={chip.keepNull}
              count={numbers.nullCount}
              onToggle={() => onChange({ ...chip, keepNull: !chip.keepNull })}
            />
          ) : null}
        </>
      ) : numbers ? (
        <div className="tui-hint" style={{ padding: "2px 6px 4px" }}>
          {`${fmtCount(numbers.nullCount)} rows have no value.`}
        </div>
      ) : null}
      <div className="tui-popf">
        <span>{summary}</span>
        <button
          type="button"
          className="tui-link"
          onClick={() => {
            setAnchor(null);
            onChange({ ...chip, op: "between", min: null, max: null, keepNull: false });
          }}
        >
          Reset
        </button>
      </div>
    </>
  );
};

// --- fixed conditions ---

const FixedEditor: React.FC<ChipEditorProps & { chip: FixedChip; title: string }> = ({
  chip,
  title,
  context,
  onRemove,
  onClose,
}) => {
  const summary = usePassingSummary(chip, context);
  const condition = (chip.exp as SubExp).toSqlWhere(getDefaultDialect());
  return (
    <>
      <Header title={title} kind={chipKind(chip, context)} onClose={onClose} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 6px 6px" }}>
        <code className="tui-cond">{condition}</code>
        <span className="tui-hint">
          This condition came from a saved view. The filter bar can't edit this kind of
          condition, but it still applies. Remove it to filter this column another way.
        </span>
      </div>
      <div className="tui-popf">
        <span>{summary}</span>
        <button type="button" className="tui-link" onClick={onRemove}>
          Remove
        </button>
      </div>
    </>
  );
};
