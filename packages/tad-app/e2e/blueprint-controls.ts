/*
 * ViewControls driver for the current UI: the Blueprint sidebar (a grid of
 * Show/Pivot/Sort checkboxes, plus Order, Pivot, Sort, Aggregations and
 * Format tabs) and the filter dialog that opens from the footer.
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

// NumFormatOptions.formatMethod for each method:
const METHOD = { auto: "auto", full: "toString", custom: "toLocaleString" };

export class BlueprintControls implements ViewControls {
  constructor(readonly page: Page) {}

  // --- sidebar ---

  async openViewSettings(): Promise<void> {
    const button = this.page.locator(".activityBar button:has(.bp4-icon-pivot-table)");
    if (!((await button.getAttribute("class")) ?? "").includes("bp4-active")) {
      await button.click();
    }
    await expect(this.page.locator(".column-selector")).toBeVisible();
  }

  private columnRow(column: string): Locator {
    return this.page.locator(
      `.column-selector-body tr:has(.col-colName-text[title="${column}"])`
    );
  }

  /** Tick or untick a checkbox, and wait for the UI to show it. */
  private async setChecked(box: Locator, on: boolean): Promise<void> {
    if ((await box.isChecked()) !== on) {
      await box.click();
    }
    await expect(box).toBeChecked({ checked: on });
  }

  /** A Blueprint Checkbox: the input is hidden behind its label. */
  private async setLabelledCheckbox(label: string, on: boolean): Promise<void> {
    const control = this.page.locator("label.bp4-control", { hasText: label });
    const input = control.locator("input");
    if ((await input.isChecked()) !== on) {
      await control.click();
    }
    await expect(input).toBeChecked({ checked: on });
  }

  async setShown(column: string, shown: boolean): Promise<void> {
    await this.openViewSettings();
    await this.setChecked(
      this.columnRow(column).locator('input[title="Show this column"]'),
      shown
    );
  }

  async setAllShown(shown: boolean): Promise<void> {
    await this.openViewSettings();
    // The "All Columns" box shows all columns unless they're all shown
    // already, when it hides them all:
    const box = this.page.locator('input[title="Show all columns"]');
    if (!(await box.isChecked())) {
      await box.click();
      await expect(box).toBeChecked();
    }
    if (!shown) {
      await box.click();
      await expect(box).not.toBeChecked();
    }
  }

  private async checkAllOff(title: string): Promise<void> {
    const boxes = this.page.locator(`.column-selector-body input[title="${title}"]`);
    const n = await boxes.count();
    for (let i = 0; i < n; i++) {
      await this.setChecked(boxes.nth(i), false);
    }
  }

  async setPivot(columns: string[]): Promise<void> {
    await this.openViewSettings();
    await this.checkAllOff("Pivot by column");
    // Pivot columns are added in the order they're ticked:
    for (const c of columns) {
      await this.setChecked(this.columnRow(c).locator('input[title="Pivot by column"]'), true);
    }
  }

  private async openTab(name: string): Promise<Locator> {
    await this.openViewSettings();
    await this.page.getByRole("tab", { name, exact: true }).click();
    const panel = this.page.locator('[role="tabpanel"][aria-hidden="false"]');
    await expect(panel).toBeVisible();
    return panel;
  }

  private tabRow(panel: Locator, column: string): Locator {
    return panel.locator(`.column-list-body tr:has(td.col-colName:text-is("${column}"))`);
  }

  async setSort(keys: [string, SortDir][]): Promise<void> {
    await this.openViewSettings();
    await this.checkAllOff("Sort by column");
    for (const [c] of keys) {
      await this.setChecked(this.columnRow(c).locator('input[title="Sort by column"]'), true);
    }
    const panel = await this.openTab("Sort");
    for (const [c, dir] of keys) {
      const select = this.tabRow(panel, c).locator("select");
      await select.selectOption(dir);
      await expect(select).toHaveValue(dir);
    }
  }

  async moveColumnBefore(column: string, before: string): Promise<void> {
    const panel = await this.openTab("Order");
    const src = this.tabRow(panel, column);
    const dst = this.tabRow(panel, before);
    const names = panel.locator(".column-list-body td.col-colName");
    const moved = async () => {
      const order = await names.allTextContents();
      return order.indexOf(column) === order.indexOf(before) - 1;
    };
    // The list scrolls, and both rows may not fit. (Locator.dragTo scrolls
    // the target into view after pressing the mouse on the source, so the
    // drag starts on whatever row is then under the mouse.) Start dragging
    // the source, then scroll to the target and drop. HTML5 drags are
    // occasionally not picked up, so check, and try again if needed:
    const mouse = this.page.mouse;
    for (let attempt = 0; attempt < 3 && !(await moved()); attempt++) {
      await src.scrollIntoViewIfNeeded();
      const s = (await src.boundingBox())!;
      await mouse.move(s.x + s.width / 2, s.y + s.height / 2);
      await mouse.down();
      await mouse.move(s.x + s.width / 2, s.y + s.height / 2 + 12, { steps: 6 });
      await dst.evaluate((el) => el.scrollIntoView({ block: "nearest" }));
      const d = (await dst.boundingBox())!;
      await mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 8 });
      await mouse.move(d.x + d.width / 2, d.y + d.height / 2 + 1);
      await mouse.up();
      await expect.poll(moved, { timeout: 2000 }).toBe(true).catch(() => {});
    }
    expect(await moved()).toBe(true);
  }

  async setAggregation(column: string, agg: string): Promise<void> {
    const panel = await this.openTab("Aggregations");
    const select = this.tabRow(panel, column).locator("select");
    await select.selectOption(agg);
    await expect(select).toHaveValue(agg);
  }

  async setLeafColumn(column: string | null): Promise<void> {
    await this.openViewSettings();
    const select = this.page.locator(".pivot-leaf-select select");
    await select.selectOption(column ?? "__none");
  }

  async setShowHistograms(on: boolean): Promise<void> {
    await this.openViewSettings();
    await this.setLabelledCheckbox("Show Numeric Column Histograms", on);
  }

  async setShowTotalsRow(on: boolean): Promise<void> {
    await this.openViewSettings();
    await this.setLabelledCheckbox("Show Global Aggregations as Top Row", on);
  }

  /** Format tab, targeting a type's default ("default") or one column. */
  private async formatTarget(target: "default" | "column", value: string) {
    const panel = await this.openTab("Format");
    const radio = panel.locator(`input[type="radio"][value="${target}"]`);
    await radio.check({ force: true });
    await expect(radio).toBeChecked();
    const select =
      target === "default"
        ? panel.locator('label.bp4-radio:has(input[value="default"]) select')
        : panel.locator("select.format-col-select");
    await select.selectOption(value);
    return panel;
  }

  private async setNumberFormat(panel: Locator, format: NumberFormat) {
    const sub = panel.locator(".num-format-panel");
    if (format.method) {
      await sub.locator("select").selectOption(METHOD[format.method]);
    }
    if (format.commas !== undefined) {
      await this.setLabelledCheckbox("Use (,) as 1000s Separator", format.commas);
    }
    if (format.decimals !== undefined) {
      await sub.locator("input.bp4-input").fill(String(format.decimals));
    }
    if (format.exponential !== undefined) {
      await this.setLabelledCheckbox("Use Scientific (exponential) Notation", format.exponential);
    }
  }

  async setDefaultNumberFormat(kind: "integer" | "real", format: NumberFormat) {
    await this.setNumberFormat(await this.formatTarget("default", kind), format);
  }

  async setColumnNumberFormat(column: string, format: NumberFormat) {
    await this.setNumberFormat(await this.formatTarget("column", column), format);
  }

  async setDefaultTextFormat(format: TextFormat) {
    await this.formatTarget("default", "string");
    if (format.urlsAsLinks !== undefined) {
      await this.setLabelledCheckbox("Render URLs as Hyperlinks", format.urlsAsLinks);
    }
  }

  async setColumnTextFormat(column: string, format: TextFormat) {
    await this.formatTarget("column", column);
    if (format.urlsAsLinks !== undefined) {
      await this.setLabelledCheckbox("Render URLs as Hyperlinks", format.urlsAsLinks);
    }
  }

  // --- filter dialog ---

  private get editor(): Locator {
    return this.page.locator(".filter-editor");
  }

  private get conditionRows(): Locator {
    return this.editor.locator(".filter-editor-row:has(.filter-editor-row-predicate)");
  }

  private async openFilterEditor(): Promise<void> {
    if (!(await this.editor.isVisible())) {
      await this.page.locator(".footer-filter-block a").click();
    }
    await expect(this.editor).toBeVisible();
  }

  private async fillCondition(row: Locator, c: FilterCondition): Promise<void> {
    await row.locator(".filter-row-col-select select").selectOption(c.column);
    await row.locator(".filter-row-op-select select").selectOption(c.op);
    if (Array.isArray(c.value)) {
      // react-select, which loads the column's values as you type:
      const input = row.locator('.filter-editor-value input[aria-autocomplete="list"]');
      for (const v of c.value) {
        await input.fill(v);
        await this.page
          .locator(".filter-editor-value__option", { hasText: new RegExp(`^${v}$`) })
          .click();
      }
    } else if (typeof c.value === "number") {
      await row.locator(".bp4-numeric-input input").fill(String(c.value));
    } else if (c.value !== undefined) {
      await row.locator("input.filter-editor-value").fill(c.value);
    }
  }

  private async editFilter(match: Match, conditions: FilterCondition[]) {
    await this.openFilterEditor();
    for (let n = await this.conditionRows.count(); n > 0; n--) {
      await this.conditionRows.first().locator(":scope > button").click();
      await expect(this.conditionRows).toHaveCount(n - 1);
    }
    await this.editor
      .locator(".filter-editor-select-row select")
      .selectOption(match === "all" ? "AND" : "OR");
    for (const [i, c] of conditions.entries()) {
      await this.editor.locator(".filter-edit-add-row button").click();
      await expect(this.conditionRows).toHaveCount(i + 1);
      await this.fillCondition(this.conditionRows.last(), c);
    }
  }

  private async clickEditorButton(name: string): Promise<void> {
    await this.editor.locator(".delayed-calc-footer").getByRole("button", { name }).click();
  }

  async setFilter(match: Match, conditions: FilterCondition[]): Promise<void> {
    await this.editFilter(match, conditions);
    await this.clickEditorButton("Done");
    await expect(this.editor).toBeHidden();
  }

  async clearFilter(): Promise<void> {
    await this.setFilter("all", []);
  }

  async previewFilter(match: Match, conditions: FilterCondition[]): Promise<void> {
    await this.editFilter(match, conditions);
    await this.clickEditorButton("Apply");
  }

  async cancelFilterEdit(): Promise<void> {
    await this.clickEditorButton("Cancel");
    await expect(this.editor).toBeHidden();
  }
}
