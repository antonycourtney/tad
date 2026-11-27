/*
 * The new UI's column header menu (TAD_UI=new, with the DOM grid). Formats
 * and aggregations set through it are also covered by view-controls.e2e.ts.
 */
import { Page } from "@playwright/test";
import { expect, GRID_IMPL, test } from "./fixtures";
import { N_ROWS, PARQUET_FILE, SORTED_TAD_FILE, testFile } from "./test-data";
import { UI_IMPL } from "./view-controls";

test.skip(UI_IMPL !== "new" || GRID_IMPL !== "dom", "for the new UI, with the DOM grid");

const header = (page: Page, column: string) =>
  page.locator(`.tad-grid-header-cell[data-col-id="${column}"]`);

const menuItem = (page: Page, name: string | RegExp) =>
  page.getByRole("menu").getByRole("menuitem", { name });

const choose = async (page: Page, column: string, item: string | RegExp) => {
  await header(page, column).click({ button: "right" });
  await menuItem(page, item).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
};

test("the ▾ button opens the menu, without sorting", async ({ openInTad }) => {
  const { page } = await openInTad(testFile(PARQUET_FILE));
  await header(page, "quantity").hover();
  const button = header(page, "quantity").getByRole("button", { name: "quantity column menu" });
  await button.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(header(page, "quantity")).not.toHaveAttribute("aria-sort", /.*/);
});

test("sorts, and clears the sort", async ({ openInTad }) => {
  const { grid, page } = await openInTad(testFile(PARQUET_FILE));
  const qtyCol = await grid.columnIndex("quantity");
  await choose(page, "quantity", "Sort descending");
  await expect(header(page, "quantity")).toHaveAttribute("aria-sort", "descending");
  await grid.expectCellText(qtyCol, 0, "20");
  await choose(page, "quantity", "Sort ascending");
  await expect(header(page, "quantity")).toHaveAttribute("aria-sort", "ascending");
  await grid.expectCellText(qtyCol, 0, "1");
  await choose(page, "quantity", "Clear sort");
  await expect(header(page, "quantity")).not.toHaveAttribute("aria-sort", /.*/);
});

test("pivots by a column, and stops", async ({ openInTad }) => {
  const { grid, page } = await openInTad(testFile(PARQUET_FILE));
  await choose(page, "region", "Pivot by region");
  await expect(header(page, "_pivot")).toBeVisible();
  await expect.poll(() => grid.rowCount()).toBeLessThan(10);
  await choose(page, "region", "Remove from pivot");
  await expect(header(page, "_pivot")).toHaveCount(0);
  await grid.expectRowCount(N_ROWS);
});

test("Filter… opens the column's chip, or adds one", async ({ openInTad }) => {
  const { page, controls } = await openInTad(testFile(PARQUET_FILE));
  const chips = page.locator(".tui-filterbar .tui-chip");
  const popover = page.locator(".tui-pop:not(.tui-narrow)");
  await choose(page, "region", "Filter…");
  await expect(popover).toBeVisible();
  await expect(chips).toHaveCount(1);
  // Esc removes a chip that was just added:
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(chips).toHaveCount(0);

  await controls.setFilter("all", [{ column: "region", op: "IN", value: ["North"] }]);
  await choose(page, "region", "Edit filter…");
  await expect(popover.locator('.tui-vrow[data-value="North"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(chips).toHaveCount(1);
});

test("hides a column", async ({ openInTad }) => {
  const { page } = await openInTad(testFile(PARQUET_FILE));
  await expect(header(page, "note")).toBeVisible();
  await choose(page, "note", "Hide column");
  await expect(header(page, "note")).toHaveCount(0);
});

test("a column's format goes back to the default", async ({ openInTad }) => {
  const { grid, page, controls } = await openInTad(testFile(SORTED_TAD_FILE));
  const revenueCol = await grid.columnIndex("revenue");
  await controls.setColumnNumberFormat("revenue", { method: "custom", decimals: 0 });
  await grid.expectCellText(revenueCol, 1, "4,351");
  await choose(page, "revenue", "Format…");
  await page.getByRole("button", { name: "Reset to the Real default" }).click();
  await grid.expectCellText(revenueCol, 1, "4,351.32");
});
