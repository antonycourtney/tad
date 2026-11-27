/*
 * The format editor: how a column's values are shown, or the default for a
 * type of column. It goes in a popover (from the header menu's "Format…",
 * or the sidebar's Format list).
 */
import * as React from "react";
import { StateRef } from "oneref";
import { ColumnKind, Schema } from "reltab";
import * as actions from "../../actions";
import { AppState } from "../../AppState";
import { FormatOptions } from "../../FormatOptions";
import { FormatMethod, NumFormatOptions } from "../../NumFormatOptions";
import { TextFormatOptions } from "../../TextFormatOptions";
import { ViewParams } from "../../ViewParams";
import { ViewState } from "../../ViewState";
import { X } from "./icons";
import { typeIcon } from "./typeIcon";

/** A column's own format, or the default for a kind of column. */
export type FormatTarget = { column: string } | { kind: ColumnKind };

const KIND_NAMES: Partial<Record<ColumnKind, string>> = {
  integer: "Integer",
  real: "Real",
  string: "Text",
  boolean: "Boolean",
};

export const kindName = (kind: ColumnKind) => KIND_NAMES[kind] ?? kind;

/** The format a target has now, if the format editor can edit it. */
export function editableFormat(
  target: FormatTarget,
  viewParams: ViewParams,
  schema: Schema
): NumFormatOptions | TextFormatOptions | null {
  const opts: FormatOptions | undefined =
    "column" in target
      ? viewParams.getColumnFormat(schema, target.column)
      : (viewParams.defaultFormats.get(target.kind) as FormatOptions | undefined);
  return opts instanceof NumFormatOptions || opts instanceof TextFormatOptions ? opts : null;
}

const SAMPLE_COUNT = 4;

/** The rows the grid has loaded so far (for previews of formats). */
export function* loadedRows(viewState: ViewState, max = 200): Iterable<any> {
  const dv = viewState.dataView;
  if (!dv) {
    return;
  }
  const n = Math.min(dv.getLength(), max);
  for (let i = 0; i < n; i++) {
    yield dv.getItem(i);
  }
}

/**
 * A few of a column's values, for the preview: the first distinct ones in the
 * rows loaded so far.
 */
export function sampleValues(rows: Iterable<any>, column: string): any[] {
  const seen = new Set<string>();
  const samples: any[] = [];
  for (const row of rows) {
    const v = row?.[column];
    if (v != null && !seen.has(String(v))) {
      seen.add(String(v));
      samples.push(v);
      if (samples.length >= SAMPLE_COUNT) {
        break;
      }
    }
  }
  return samples;
}

export const FALLBACK_SAMPLES: Partial<Record<ColumnKind, any[]>> = {
  integer: [0, 42, 1234567],
  real: [3.14159265, -0.000125, 1234567.891],
  string: ["Some text", "https://example.com"],
};

export interface FormatEditorProps {
  target: FormatTarget;
  viewParams: ViewParams;
  schema: Schema;
  stateRef: StateRef<AppState>;
  /** Values to preview (if none, made-up ones for the type). */
  samples: any[];
  onClose: () => void;
}

/** What a format does, in a few words (as the header menu's Format… shows it). */
export function formatSummary(opts: NumFormatOptions | TextFormatOptions): string {
  if (opts instanceof TextFormatOptions) {
    return opts.urlsAsHyperlinks ? "URLs as links" : "Plain text";
  }
  switch (opts.formatMethod) {
    case "auto":
      return "Automatic" + (opts.commas ? "" : ", no 1,000s");
    case "toString":
      return "Full precision";
    default: {
      const dp = opts.decimalPlaces ?? 0;
      return opts.exponential
        ? `Scientific, ${dp} dp`
        : `${dp} decimal${dp === 1 ? "" : "s"}` + (opts.commas ? "" : ", no 1,000s");
    }
  }
}

/** The values a number preview shows: the largest first, then the smallest and one other. */
const previewValues = (values: any[]): any[] => {
  const nums = values.filter((v) => typeof v === "number" || typeof v === "bigint");
  if (nums.length < 2) {
    return values.slice(0, 3);
  }
  const sorted = [...nums].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const largest = sorted[0];
  const smallest = sorted[sorted.length - 1];
  const other = nums.find((v) => v !== largest && v !== smallest);
  return [largest, smallest, ...(other !== undefined ? [other] : [])];
};

export const FormatEditor: React.FC<FormatEditorProps> = ({
  target,
  viewParams,
  schema,
  stateRef,
  samples,
  onClose,
}) => {
  const opts = editableFormat(target, viewParams, schema);
  const isColumn = "column" in target;
  const kind: ColumnKind = isColumn
    ? schema.columnType(target.column).kind
    : (target as { kind: ColumnKind }).kind;
  if (opts === null) {
    return null;
  }
  const set = (next: NumFormatOptions | TextFormatOptions) => {
    if (isColumn) {
      actions.setColumnFormatOptions(target.column, next, stateRef);
    } else {
      actions.setDefaultFormatOptions(kind, next, stateRef);
    }
  };
  const own = isColumn && viewParams.columnFormats.has(target.column);
  const kn = kindName(kind);
  const users = schema.columns.filter(
    (c) => schema.columnType(c).kind === kind && !viewParams.columnFormats.has(c)
  ).length;
  const title = isColumn ? schema.displayName(target.column) : `${kn} default`;
  const subtitle = isColumn
    ? own
      ? "Its own format"
      : `Uses the ${kn} default`
    : `Used by ${users} ${kn.toLowerCase()} column${users === 1 ? "" : "s"}`;
  const footNote = isColumn
    ? own
      ? ""
      : "Changes apply to this column only"
    : "Columns with their own format keep it";
  const isNumber = opts instanceof NumFormatOptions;
  const given = samples.length > 0 ? samples : FALLBACK_SAMPLES[kind] ?? [];
  const shown = isNumber ? previewValues(given) : given.slice(0, 2);
  const formatter = opts.getFormatter();
  return (
    <>
      <div className="tui-poph tui-fmthead">
        <span className="tui-typeicon" aria-hidden="true">
          {typeIcon(kind)}
        </span>
        <div className="tui-fmttitle">
          <span className="tui-poph-title">{title}</span>
          <span className="tui-fmtsub">{subtitle}</span>
        </div>
        <button type="button" className="tui-chipx" aria-label="Close" onClick={onClose}>
          <X size={12} strokeWidth={1.8} />
        </button>
      </div>
      <div className={"tui-preview" + (isNumber ? "" : " tui-text")} aria-label="Preview">
        {shown.map((v, i) => {
          const s = formatter(v) ?? "";
          const link = !isNumber && s.startsWith("<a ");
          return (
            <span
              key={i}
              className={(isNumber && i === 0 ? "tui-p0" : "tui-ps") + (link ? " tui-plink" : "")}
            >
              {link ? String(v) : s}
            </span>
          );
        })}
      </div>
      {opts instanceof NumFormatOptions ? (
        <NumberFormat opts={opts} set={set} />
      ) : (
        <Switch
          label="Show URLs as links"
          on={opts.urlsAsHyperlinks}
          onChange={(on) => set(opts.set("urlsAsHyperlinks", on) as TextFormatOptions)}
        />
      )}
      <div className="tui-popf">
        <span className="tui-fmtfoot">{footNote}</span>
        {own ? (
          <button
            type="button"
            className="tui-link"
            onClick={() => actions.clearColumnFormat((target as { column: string }).column, stateRef)}
          >
            Reset to the {kn} default
          </button>
        ) : null}
      </div>
    </>
  );
};

const METHODS: [FormatMethod, string, string][] = [
  ["auto", "Auto", "Up to 12 significant digits"],
  ["toString", "Full", "Every digit, as stored"],
  ["toLocaleString", "Custom", "A fixed number of decimal places"],
];

const NumberFormat: React.FC<{
  opts: NumFormatOptions;
  set: (next: NumFormatOptions) => void;
}> = ({ opts, set }) => {
  const method = opts.formatMethod;
  const custom = method === "toLocaleString";
  const decimals = opts.decimalPlaces ?? 0;
  const setDecimals = (n: number) =>
    set(opts.set("decimalPlaces", Math.max(0, Math.min(20, n))) as NumFormatOptions);
  const note = METHODS.find(([m]) => m === method)?.[2] ?? "";
  return (
    <>
      <div className="tui-frow">
        <span>Method</span>
        <div className="tui-seg" role="group" aria-label="Format">
          {METHODS.map(([m, label, title]) => (
            <button
              key={m}
              type="button"
              className="tui-segb"
              aria-pressed={method === m}
              title={title}
              onClick={() => set(opts.set("formatMethod", m) as NumFormatOptions)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="tui-hint tui-methodnote">{note}</div>
      {custom ? (
        <div className="tui-frow">
          <span>Decimal places</span>
          <div className="tui-stepper">
            <button
              type="button"
              aria-label="Fewer decimal places"
              disabled={decimals <= 0}
              onClick={() => setDecimals(decimals - 1)}
            >
              −
            </button>
            <input
              type="number"
              min={0}
              max={20}
              value={decimals}
              aria-label="Decimal places"
              onChange={(e) => {
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isInteger(n)) {
                  setDecimals(n);
                }
              }}
            />
            <button
              type="button"
              aria-label="More decimal places"
              disabled={decimals >= 20}
              onClick={() => setDecimals(decimals + 1)}
            >
              +
            </button>
          </div>
        </div>
      ) : null}
      {method === "auto" || (custom && !opts.exponential) ? (
        <Switch
          label="1,000s separator"
          on={opts.commas}
          onChange={(on) => set(opts.set("commas", on) as NumFormatOptions)}
        />
      ) : null}
      {custom ? (
        <Switch
          label="Scientific notation"
          on={opts.exponential}
          onChange={(on) => set(opts.set("exponential", on) as NumFormatOptions)}
        />
      ) : null}
    </>
  );
};

export const Switch: React.FC<{
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}> = ({ label, on, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    className="tui-switchrow"
    onClick={() => onChange(!on)}
  >
    <span>{label}</span>
    <span className="tui-switch" aria-hidden="true">
      <span />
    </span>
  </button>
);
