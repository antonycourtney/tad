/*
 * ViewControls driver for the new UI (TAD_UI=new): the view settings
 * sidebar, the column header menu (DOM grid only) and the filter bar.
 *
 * Column formats and aggregations are set through the header menu with the
 * DOM grid, and through the sidebar with others. Columns are moved by
 * keyboard (Space, arrow keys, Space), which also tests that dragging works
 * from the keyboard.
 *
 * The filter bar has a chip per condition: text columns pick values or match
 * text, number columns keep a range. Each reltab condition the tests ask for
 * becomes the chip that filters the same way, except that the new UI's
 * "all but" (NOT IN, NEQ) and negative text matches keep rows with no value
 * (see doc/ui-todo.md).
 */
import { expect, Locator, Page } from "@playwright/test";
import type {
  FilterCondition,
  Match,
  NumberFormat,
  SortDir,
  TextFormat,
  ViewControls,
} from "./view-controls";

const METHOD_LABELS = { auto: "Auto", full: "Full", custom: "Custom" };

const MATCH_OPS: Record<string, string> = {
  CONTAINS: "contains",
  NOTCONTAINS: "notcontains",
  BEGINS: "begins",
  NOTBEGINS: "notbegins",
  ENDS: "ends",
  NOTENDS: "notends",
};

export class NewUIControls implements ViewControls {
  constructor(readonly page: Page) {}

  /** The header menu is the DOM grid's. */
  private readonly headerMenus = (process.env.TAD_GRID ?? "dom") === "dom";

  // --- the sidebar ---

  private get sidebar(): Locator {
    return this.page.getByRole("complementary", { name: "View settings" });
  }

  async openViewSettings(): Promise<void> {
    if (!((await this.sidebar.getAttribute("class")) ?? "").includes("sidebar-expanded")) {
      await this.page.getByRole("button", { name: "View settings" }).click();
    }
    await expect(this.sidebar).toHaveClass(/sidebar-expanded/);
  }

  private async setMode(mode: "Layout" | "Aggregation" | "Format"): Promise<void> {
    await this.openViewSettings();
    const button = this.sidebar
      .getByRole("group", { name: "Column list shows" })
      .getByRole("button", { name: mode, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }

  private async toggle(name: string, on: boolean): Promise<void> {
    const button = this.sidebar.getByRole("button", { name, exact: true });
    if ((await button.getAttribute("aria-pressed")) !== String(on)) {
      await button.click();
    }
    await expect(button).toHaveAttribute("aria-pressed", String(on));
  }

  async setShown(column: string, shown: boolean): Promise<void> {
    await this.setMode("Layout");
    await this.toggle(`Show ${column}`, shown);
  }

  async setAllShown(shown: boolean): Promise<void> {
    await this.setMode("Layout");
    const all = this.sidebar.getByRole("button", { name: "Show all columns" });
    // Some shown ("mixed"): a click shows them all.
    if ((await all.getAttribute("aria-pressed")) !== "true") {
      await all.click();
      await expect(all).toHaveAttribute("aria-pressed", "true");
    }
    if (!shown) {
      await all.click();
      await expect(all).toHaveAttribute("aria-pressed", "false");
    }
  }

  private async shownOrder(): Promise<string[]> {
    return this.sidebar
      .locator(".tui-colrow[data-column]:not(.tui-hidden)")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.column!));
  }

  /** Pick up a sortable item by keyboard, move it `steps` (negative: up/left), drop it. */
  private async keyboardMove(handle: Locator, steps: number, vertical: boolean): Promise<void> {
    await handle.focus();
    await this.page.keyboard.press("Space");
    await this.page.waitForTimeout(100);
    const key = vertical ? (steps < 0 ? "ArrowUp" : "ArrowDown") : steps < 0 ? "ArrowLeft" : "ArrowRight";
    for (let i = 0; i < Math.abs(steps); i++) {
      await this.page.keyboard.press(key);
      await this.page.waitForTimeout(100);
    }
    await this.page.keyboard.press("Space");
  }

  async moveColumnBefore(column: string, before: string): Promise<void> {
    await this.setMode("Layout");
    const order = await this.shownOrder();
    const from = order.indexOf(column);
    const target = order.indexOf(before);
    const to = from < target ? target - 1 : target;
    const handle = this.sidebar.locator(`.tui-colrow[data-column="${column}"] .tui-grip`);
    await this.keyboardMove(handle, to - from, true);
    await expect.poll(() => this.shownOrder()).toEqual(
      (() => {
        const next = order.filter((c) => c !== column);
        next.splice(next.indexOf(before), 0, column);
        return next;
      })()
    );
  }

  private shelfChips(shelf: "Pivot" | "Sort"): Locator {
    return this.sidebar.getByRole("group", { name: shelf, exact: true }).locator(".tui-shelfchip");
  }

  private async clearShelf(shelf: "Pivot" | "Sort"): Promise<void> {
    const chips = this.shelfChips(shelf);
    for (let n = await chips.count(); n > 0; n--) {
      await chips.first().getByRole("button", { name: /^Remove / }).click();
      await expect(chips).toHaveCount(n - 1);
    }
  }

  async setPivot(columns: string[]): Promise<void> {
    await this.setMode("Layout");
    await this.clearShelf("Pivot");
    for (const c of columns) {
      await this.toggle(`Pivot by ${c}`, true);
    }
    await expect
      .poll(() => this.shelfChips("Pivot").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.column)))
      .toEqual(columns);
  }

  async setSort(keys: [string, SortDir][]): Promise<void> {
    await this.setMode("Layout");
    await this.clearShelf("Sort");
    for (const [c, dir] of keys) {
      // Ascending, then descending:
      const button = this.sidebar.getByRole("button", { name: `Sort by ${c}`, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      if (dir === "desc") {
        await button.click();
        await expect(this.shelfChips("Sort").last().getByRole("button", { name: `Sort ${c} ascending` })).toBeVisible();
      }
    }
    await expect(this.shelfChips("Sort")).toHaveCount(keys.length);
  }

  async setLeafColumn(column: string | null): Promise<void> {
    await this.openViewSettings();
    await this.sidebar.getByRole("combobox", { name: "Label leaf rows with" }).selectOption(column ?? "");
  }

  async setShowHistograms(on: boolean): Promise<void> {
    await this.openViewSettings();
    await this.setSwitch(this.sidebar, "Column histograms", on);
  }

  async setShowTotalsRow(on: boolean): Promise<void> {
    await this.openViewSettings();
    await this.setSwitch(this.sidebar, "Totals as top row", on);
  }

  // --- formats ---

  private get formatEditor(): Locator {
    return this.page.locator(".tui-pop", { has: this.page.locator(".tui-preview") });
  }

  /** The format editor for a column (from its header menu, or the sidebar), or a default. */
  private async openFormatEditor(target: { column: string } | { kind: string }): Promise<Locator> {
    if ("column" in target && this.headerMenus) {
      await this.openHeaderMenu(target.column);
      await this.page.getByRole("menuitem", { name: "Format…" }).click();
    } else {
      await this.setMode("Format");
      const key = "column" in target ? `column:${target.column}` : `default:${target.kind}`;
      await this.sidebar.locator(`[data-format="${key}"]`).click();
    }
    await expect(this.formatEditor).toBeVisible();
    return this.formatEditor;
  }

  private async closeFormatEditor(editor: Locator): Promise<void> {
    await editor.getByRole("button", { name: "Close" }).click();
    await expect(editor).toBeHidden();
  }

  private async setSwitch(within: Locator, name: string, on: boolean): Promise<void> {
    const sw = within.getByRole("switch", { name });
    if ((await sw.getAttribute("aria-checked")) !== String(on)) {
      await sw.click();
    }
    await expect(sw).toHaveAttribute("aria-checked", String(on));
  }

  private async editNumberFormat(editor: Locator, format: NumberFormat): Promise<void> {
    if (format.method) {
      const button = editor.getByRole("button", { name: METHOD_LABELS[format.method], exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
    if (format.decimals !== undefined) {
      const input = editor.getByRole("spinbutton", { name: "Decimal places" });
      await input.fill(String(format.decimals));
      await expect(input).toHaveValue(String(format.decimals));
    }
    if (format.exponential !== undefined) {
      await this.setSwitch(editor, "Scientific notation", format.exponential);
    }
    if (format.commas !== undefined) {
      await this.setSwitch(editor, "1,000s separator", format.commas);
    }
    await this.closeFormatEditor(editor);
  }

  private async editTextFormat(editor: Locator, format: TextFormat): Promise<void> {
    if (format.urlsAsLinks !== undefined) {
      await this.setSwitch(editor, "Show URLs as links", format.urlsAsLinks);
    }
    await this.closeFormatEditor(editor);
  }

  async setDefaultNumberFormat(kind: "integer" | "real", format: NumberFormat): Promise<void> {
    await this.editNumberFormat(await this.openFormatEditor({ kind }), format);
  }

  async setColumnNumberFormat(column: string, format: NumberFormat): Promise<void> {
    await this.editNumberFormat(await this.openFormatEditor({ column }), format);
  }

  async setDefaultTextFormat(format: TextFormat): Promise<void> {
    await this.editTextFormat(await this.openFormatEditor({ kind: "string" }), format);
  }

  async setColumnTextFormat(column: string, format: TextFormat): Promise<void> {
    await this.editTextFormat(await this.openFormatEditor({ column }), format);
  }

  // --- aggregations ---

  async setAggregation(column: string, agg: string): Promise<void> {
    const label = agg === "null" ? "none" : agg;
    if (this.headerMenus) {
      await this.openHeaderMenu(column);
      await this.page.getByRole("menuitem", { name: /^Aggregation/ }).click();
      await this.page.getByRole("menuitemradio", { name: label, exact: true }).click();
      await expect(this.page.getByRole("menu")).toHaveCount(0);
    } else {
      await this.setMode("Aggregation");
      await this.sidebar.getByRole("combobox", { name: `Aggregate ${column} with` }).selectOption(agg);
    }
  }

  // --- the column header menu ---

  private async openHeaderMenu(column: string): Promise<void> {
    const header = this.page.locator(`.tad-grid-header-cell[data-col-id="${column}"]`);
    await header.scrollIntoViewIfNeeded();
    await header.click({ button: "right" });
    await expect(this.page.getByRole("menu")).toBeVisible();
  }

  // --- the filter bar ---

  private get filterBar(): Locator {
    return this.page.locator(".tui-filterbar");
  }

  /** The open chip's popover (not the "+ Filter" column list). */
  private get chipPopover(): Locator {
    return this.page.locator(".tui-pop:not(.tui-narrow)");
  }

  private async addChip(column: string): Promise<void> {
    await this.filterBar.locator(".tui-addbtn").click();
    await this.page.locator(`.tui-narrow .tui-mi[data-column="${column}"]`).click();
    await expect(this.chipPopover).toBeVisible();
  }

  private async openChip(column: string): Promise<void> {
    await this.filterBar.locator(`.tui-chip[data-column="${column}"] .tui-chipmain`).click();
    await expect(this.chipPopover).toBeVisible();
  }

  private async closeChip(): Promise<void> {
    await this.chipPopover.getByRole("button", { name: "Close" }).click();
    await expect(this.chipPopover).toBeHidden();
  }

  private async isRangeChip(): Promise<boolean> {
    const pop = this.chipPopover;
    const condition = pop.locator('select[aria-label="Condition"]');
    await expect(condition.or(pop.getByRole("group", { name: "How to filter" }))).toBeVisible();
    return (await condition.count()) > 0;
  }

  /** Set up the open chip to filter as `c` does. */
  private async configure(c: FilterCondition): Promise<void> {
    if (await this.isRangeChip()) {
      await this.configureRange(c);
    } else {
      await this.configureText(c);
    }
  }

  private async configureRange(c: FilterCondition): Promise<void> {
    const pop = this.chipPopover;
    const v = c.value === undefined ? "" : String(c.value);
    const set = async (op: string, min?: string, max?: string, keepNull?: boolean) => {
      await pop.locator('select[aria-label="Condition"]').selectOption(op);
      if (min !== undefined) {
        await pop.locator('input[aria-label="Min"]').fill(min);
      }
      if (max !== undefined) {
        await pop.locator('input[aria-label="Max"]').fill(max);
      }
      if (keepNull !== undefined) {
        // Once the histogram is in, the NULL row is there if there are NULLs:
        await expect(pop.locator(".tui-haxis")).toBeVisible();
        const nullRow = pop.getByRole("button", { name: /Also keep rows with no value/ });
        if ((await nullRow.count()) > 0 && (await this.isPressed(nullRow)) !== keepNull) {
          await nullRow.click();
        }
      }
    };
    switch (c.op) {
      case "EQ":
        return set("between", v, v);
      case "NEQ":
        return set("outside", v, v);
      case "GE":
        return set("between", v, "");
      case "LE":
        return set("between", "", v);
      // Open-ended ranges to leave out, without the NULLs that "outside"
      // keeps by default:
      case "GT":
        return set("outside", "", v, false);
      case "LT":
        return set("outside", v, "", false);
      case "ISNULL":
        return set("null");
      case "NOTNULL":
        return set("notnull");
      default:
        throw new Error(`the new UI has no ${c.op} for number columns`);
    }
  }

  private async configureText(c: FilterCondition): Promise<void> {
    const pop = this.chipPopover;
    const values = Array.isArray(c.value) ? c.value : [c.value as string];
    switch (c.op) {
      case "IN":
      case "EQ":
        return this.pickValues(values, true);
      case "NOTIN":
      case "NEQ":
        return this.pickValues(values, false);
      case "ISNULL":
        return this.pickValues([null], true);
      case "NOTNULL":
        return this.pickValues([null], false);
    }
    const matchOp = MATCH_OPS[c.op];
    if (!matchOp) {
      throw new Error(`the new UI has no ${c.op} for text columns`);
    }
    await pop.getByRole("button", { name: "Match text" }).click();
    await pop.locator('select[aria-label="How to match"]').selectOption(matchOp);
    await pop.locator('input[aria-label="Text to match"]').fill(String(c.value));
  }

  /** Keep only `values` (include), or all but them. null: rows with no value. */
  private async pickValues(values: (string | null)[], include: boolean): Promise<void> {
    const pop = this.chipPopover;
    const master = pop.locator(".tui-master");
    // Wait for the values, so that "All values" has something to (un)tick:
    await expect(pop.locator(".tui-vlist .tui-vrow").first()).toBeVisible();
    if (include) {
      await expect(master).toHaveAttribute("aria-pressed", "true");
      await master.click();
      await expect(master).toHaveAttribute("aria-pressed", "false");
    }
    const search = pop.locator('input[aria-label="Search values"]');
    for (const v of values) {
      await search.fill(v ?? "");
      const row =
        v === null
          ? pop.locator(".tui-vlist .tui-vrow[data-null]")
          : pop.locator(`.tui-vlist .tui-vrow[data-value="${v}"]`);
      await expect(row).toHaveAttribute("aria-pressed", include ? "false" : "true");
      await row.click();
      await expect(row).toHaveAttribute("aria-pressed", include ? "true" : "false");
    }
    await search.fill("");
  }

  private async isPressed(button: Locator): Promise<boolean> {
    return (await button.getAttribute("aria-pressed")) === "true";
  }

  private async setMatch(match: Match): Promise<void> {
    const button = this.filterBar
      .getByRole("group", { name: "Rows must match" })
      .getByRole("button", { name: match === "all" ? "All" : "Any" });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }

  async setFilter(match: Match, conditions: FilterCondition[]): Promise<void> {
    await this.clearFilter();
    for (const c of conditions) {
      await this.addChip(c.column);
      await this.configure(c);
      await this.closeChip();
    }
    if (conditions.length > 1) {
      await this.setMatch(match);
    }
  }

  async clearFilter(): Promise<void> {
    const clearAll = this.filterBar.getByRole("button", { name: "Clear all" });
    if (await clearAll.isVisible()) {
      await clearAll.click();
    }
    await expect(this.filterBar.locator(".tui-chip")).toHaveCount(0);
  }

  /**
   * Edit the chip for the condition's column (adding one if there isn't one),
   * leaving its popover open. The new UI edits one chip at a time.
   */
  async previewFilter(match: Match, conditions: FilterCondition[]): Promise<void> {
    if (conditions.length !== 1) {
      throw new Error("previewFilter: the new UI edits one condition at a time");
    }
    const [c] = conditions;
    if ((await this.filterBar.locator(`.tui-chip[data-column="${c.column}"]`).count()) > 0) {
      await this.openChip(c.column);
    } else {
      await this.addChip(c.column);
    }
    await this.configure(c);
  }

  /** Esc: the filter goes back to how it was when the popover opened. */
  async cancelFilterEdit(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await expect(this.chipPopover).toBeHidden();
  }
}
