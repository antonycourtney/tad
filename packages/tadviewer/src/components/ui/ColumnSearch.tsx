/*
 * The search field over a list of columns (the view sidebar's, and the filter
 * bar's "Filter by column"), with a button beside it that lists the columns
 * A to Z instead of in the table's order. The order is one choice for both
 * lists, remembered from one session to the next.
 */
import * as React from "react";
import { Schema } from "reltab";
import { AZGlyph } from "./glyphs";
import { Search } from "./icons";
import { columnListOrder, usePref } from "./prefs";
import "./ui.css";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Columns A to Z by name (so c2 comes before c10). */
export const byName = (columns: string[], schema: Schema): string[] =>
  columns
    .map((c, i) => ({ c, name: schema.displayName(c), i }))
    .sort((a, b) => collator.compare(a.name, b.name) || a.i - b.i)
    .map(({ c }) => c);

/** Whether the column lists are A to Z (rather than in the table's order). */
export const useColumnsAZ = (): boolean => usePref(columnListOrder) === "az";

export const OrderToggle: React.FC = () => {
  const az = useColumnsAZ();
  return (
    <button
      type="button"
      className="tui-orderbtn"
      aria-pressed={az}
      aria-label="List columns A to Z"
      title={az ? "A to Z: click for table order" : "Table order: click for A to Z"}
      onClick={() => columnListOrder.set(az ? "table" : "az")}
    >
      <AZGlyph />
    </button>
  );
};

export const ColumnSearch: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}> = ({ value, onChange, placeholder, label, autoFocus, onKeyDown }) => (
  <div className="tui-findrow">
    <label className="tui-search">
      <Search size={14} strokeWidth={1.6} />
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </label>
    <OrderToggle />
  </div>
);
