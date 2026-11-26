/*
 * The format editor: how a column's values are shown, or the default for a
 * type of column. It goes in a popover (from the header menu's "Format…",
 * and later the sidebar's Format list).
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
import { Minus, Plus, X } from "./icons";

/** A column's own format, or the default for a kind of column. */
export type FormatTarget = { column: string } | { kind: ColumnKind };

const KIND_NAMES: Partial<Record<ColumnKind, string>> = {
  integer: "Integer",
  real: "Real",
  string: "Text",
  boolean: "Boolean",
};

const kindName = (kind: ColumnKind) => KIND_NAMES[kind] ?? kind;

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

const FALLBACK_SAMPLES: Partial<Record<ColumnKind, any[]>> = {
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
  const title = isColumn
    ? `Format ${schema.displayName(target.column)}`
    : `${kindName(kind)} default`;
  const users = isColumn
    ? 0
    : schema.columns.filter(
        (c) => schema.columnType(c).kind === kind && !viewParams.columnFormats.has(c)
      ).length;
  const shown = samples.length > 0 ? samples : FALLBACK_SAMPLES[kind] ?? [];
  const formatter = opts.getFormatter();
  return (
    <>
      <div className="tui-poph">
        <span className="tui-poph-title">{title}</span>
        <button
          type="button"
          className="tui-iconbtn"
          style={{ marginLeft: "auto" }}
          aria-label="Close"
          onClick={onClose}
        >
          <X size={12} strokeWidth={1.8} />
        </button>
      </div>
      <div
        className={"tui-preview" + (opts instanceof NumFormatOptions ? " tui-numeric" : "")}
        aria-label="Preview"
      >
        {shown.map((v, i) => {
          const s = formatter(v) ?? "";
          const link = opts instanceof TextFormatOptions && s.startsWith("<a ");
          return (
            <div key={i} className={link ? "tui-preview-link" : undefined}>
              {link ? String(v) : s}
            </div>
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
        {isColumn ? (
          own ? (
            <button
              type="button"
              className="tui-link"
              onClick={() => actions.clearColumnFormat(target.column, stateRef)}
            >
              Reset to the {kindName(kind)} default
            </button>
          ) : (
            <span>Uses the {kindName(kind)} default until changed here.</span>
          )
        ) : (
          <span>
            Used by {users} {users === 1 ? "column" : "columns"}
          </span>
        )}
      </div>
    </>
  );
};

const METHODS: [FormatMethod, string, string][] = [
  ["auto", "Auto", "Up to 12 significant digits, without floating point noise"],
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
  return (
    <>
      <div className="tui-section">
        <div className="tui-seg tui-wide" role="group" aria-label="Format">
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
      {custom ? (
        <div className="tui-frow">
          <span>Decimal places</span>
          <div className="tui-stepper">
            <button
              type="button"
              className="tui-iconbtn"
              aria-label="Fewer decimal places"
              disabled={decimals <= 0}
              onClick={() => setDecimals(decimals - 1)}
            >
              <Minus size={12} strokeWidth={2} />
            </button>
            <input
              className="tui-input"
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
              className="tui-iconbtn"
              aria-label="More decimal places"
              disabled={decimals >= 20}
              onClick={() => setDecimals(decimals + 1)}
            >
              <Plus size={12} strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}
      {custom ? (
        <Switch
          label="Scientific notation"
          on={opts.exponential}
          onChange={(on) => set(opts.set("exponential", on) as NumFormatOptions)}
        />
      ) : null}
      {method === "auto" || (custom && !opts.exponential) ? (
        <Switch
          label="1,000s separator"
          on={opts.commas}
          onChange={(on) => set(opts.set("commas", on) as NumFormatOptions)}
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
