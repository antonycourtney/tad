/*
 * What the UI tests need from the controls around the grid: the sidebar
 * (columns, pivot, sort, aggregations, formats) and the filter editor.
 *
 * Tests describe what to do ("pivot by region, then country") and check the
 * result in the grid, so the same tests run against each UI. The UI comes
 * from TAD_UI: "blueprint" (the current sidebar and filter dialog, the
 * default) has a driver in blueprint-controls.ts, and "new" (the filter bar,
 * so far) in new-ui-controls.ts.
 */
import { Page } from "@playwright/test";
import { BlueprintControls } from "./blueprint-controls";
import { NewUIControls } from "./new-ui-controls";

export const UI_IMPL = process.env.TAD_UI ?? "blueprint";

export type SortDir = "asc" | "desc";
export type Match = "all" | "any";

export interface NumberFormat {
  /** Automatic, Full precision, or Custom (fixed decimal places). */
  method?: "auto" | "full" | "custom";
  /** Thousands separators (Automatic and Custom). */
  commas?: boolean;
  /** Decimal places (Custom only). */
  decimals?: number;
  /** Scientific notation (Custom only). */
  exponential?: boolean;
}

export interface TextFormat {
  urlsAsLinks?: boolean;
}

/** reltab's filter operators (see reltab FilterExp.ts). */
export type FilterOp =
  | "EQ"
  | "NEQ"
  | "GT"
  | "GE"
  | "LT"
  | "LE"
  | "ISNULL"
  | "NOTNULL"
  | "BEGINS"
  | "NOTBEGINS"
  | "ENDS"
  | "NOTENDS"
  | "CONTAINS"
  | "NOTCONTAINS"
  | "IN"
  | "NOTIN";

export interface FilterCondition {
  column: string;
  op: FilterOp;
  /** A number for number columns; a list of values for IN and NOT IN. */
  value?: string | number | string[];
}

export interface ViewControls {
  readonly page: Page;
  /** Show the view settings (columns, pivot, sort...) if they're hidden. */
  openViewSettings(): Promise<void>;

  setShown(column: string, shown: boolean): Promise<void>;
  setAllShown(shown: boolean): Promise<void>;
  /** Move a column, in the display order, to just before another one. */
  moveColumnBefore(column: string, before: string): Promise<void>;
  /** Pivot by these columns, in this order (none: stop pivoting). */
  setPivot(columns: string[]): Promise<void>;
  /** Sort by these columns, in this order (none: unsorted). */
  setSort(keys: [string, SortDir][]): Promise<void>;
  /** How pivot rows (and the totals row) aggregate a column. */
  setAggregation(column: string, agg: string): Promise<void>;
  /** The column whose value labels leaf rows of the pivot tree (or none). */
  setLeafColumn(column: string | null): Promise<void>;
  setShowHistograms(on: boolean): Promise<void>;
  setShowTotalsRow(on: boolean): Promise<void>;

  setDefaultNumberFormat(kind: "integer" | "real", format: NumberFormat): Promise<void>;
  setColumnNumberFormat(column: string, format: NumberFormat): Promise<void>;
  setDefaultTextFormat(format: TextFormat): Promise<void>;
  setColumnTextFormat(column: string, format: TextFormat): Promise<void>;

  /** Replace the filter with these conditions, and finish editing. */
  setFilter(match: Match, conditions: FilterCondition[]): Promise<void>;
  clearFilter(): Promise<void>;
  /**
   * Change the filter to these conditions but keep editing, so the change
   * can still be cancelled with cancelFilterEdit().
   */
  previewFilter(match: Match, conditions: FilterCondition[]): Promise<void>;
  /** Cancel editing: the filter goes back to how it was before. */
  cancelFilterEdit(): Promise<void>;
}

export const viewControls = (page: Page): ViewControls => {
  switch (UI_IMPL) {
    case "blueprint":
      return new BlueprintControls(page);
    case "new":
      return new NewUIControls(page);
    default:
      throw new Error(`no view controls driver for TAD_UI=${UI_IMPL}`);
  }
};
