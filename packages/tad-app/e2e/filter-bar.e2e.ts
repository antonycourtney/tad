/*
 * The new UI's filter bar (TAD_UI=new), beyond the filter tests that run
 * against each UI (in view-controls.e2e.ts).
 */
import * as fs from "fs";
import { Page } from "@playwright/test";
import { DomGrid } from "./dom-grid";
import { expect, GRID_IMPL, test } from "./fixtures";
import { countOrders, N_ROWS, PARQUET_FILE, tadFile, testFile } from "./test-data";
import { UI_IMPL } from "./view-controls";

test.skip(UI_IMPL !== "new", "for the new UI: set TAD_UI=new");

const bar = (page: Page) => page.locator(".tui-filterbar");
const chip = (page: Page, column: string) =>
  bar(page).locator(`.tui-chip[data-column="${column}"]`);
const popover = (page: Page) => page.locator(".tui-pop:not(.tui-narrow)");
const rowCounts = (page: Page) => bar(page).locator(".footer-value");
const asNumber = (s: string | null) => Number((s ?? "").replace(/[^0-9.]/g, ""));

const addChip = async (page: Page, column: string) => {
  await bar(page).locator(".tui-addbtn").click();
  await page.locator(`.tui-narrow .tui-mi[data-column="${column}"]`).click();
  await expect(popover(page)).toBeVisible();
};

const writeView = (name: string, filterExp: object): string => {
  const file = testFile(name);
  fs.writeFileSync(file, tadFile(testFile(PARQUET_FILE), { filterExp }));
  return file;
};

const col = (colName: string) => ({ expType: "ColRef", colName });
const bin = (op: string, c: string, v: any) => ({
  expType: "BinRelExp",
  op,
  lhs: col(c),
  rhs: { expType: "ConstVal", val: v },
});

test("the value list counts rows that pass the other filters", async ({ openInTad }) => {
  const { grid, page, controls } = await openInTad(testFile(PARQUET_FILE));
  await controls.setFilter("all", [{ column: "quantity", op: "GE", value: 15 }]);
  await grid.expectRowCount(30_000);
  await expect(rowCounts(page)).toHaveText(/^30,?000 of 100,?000 rows$/);
  await addChip(page, "region");
  const north = popover(page).locator('.tui-vrow[data-value="North"] .tui-vcount');
  const expected = await countOrders("region = 'North' AND quantity >= 15");
  await expect.poll(async () => asNumber(await north.textContent())).toBe(expected);
  await expect(popover(page).locator(".tui-popf")).toHaveText(/30,?000 of 30,?000 rows pass/);
});

test("a chip that keeps every row doesn't filter", async ({ openInTad }) => {
  const { grid, page } = await openInTad(testFile(PARQUET_FILE));
  await addChip(page, "region");
  await popover(page).getByRole("button", { name: "Close" }).click();
  await expect(chip(page, "region")).toHaveClass(/tui-idle/);
  await expect(chip(page, "region").locator(".tui-chipval")).toHaveText("all");
  await grid.expectRowCount(N_ROWS);
  await expect(rowCounts(page)).toHaveText(/^100,?000 rows$/);
});

test("Esc puts the values back as they were", async ({ openInTad }) => {
  const { grid, page, controls } = await openInTad(testFile(PARQUET_FILE));
  await controls.setFilter("all", [{ column: "region", op: "IN", value: ["North"] }]);
  await grid.expectRowCount(20_000);
  await chip(page, "region").locator(".tui-chipmain").click();
  await popover(page).locator('.tui-vrow[data-value="South"]').click();
  await grid.expectRowCount(40_000);
  await page.keyboard.press("Escape");
  await expect(popover(page)).toBeHidden();
  await grid.expectRowCount(20_000);
  await expect(chip(page, "region").locator(".tui-chipval")).toHaveText("North");
});

test("a saved view's filter loads as chips", async ({ openInTad }) => {
  // (region is North or South) and (quantity < 3 or quantity > 18):
  const file = writeView("chips-nested.tad", {
    expType: "FilterExp",
    op: "AND",
    opArgs: [
      { expType: "FilterExp", op: "OR", opArgs: [bin("EQ", "region", "North"), bin("EQ", "region", "South")] },
      { expType: "FilterExp", op: "OR", opArgs: [bin("LT", "quantity", 3), bin("GT", "quantity", 18)] },
    ],
  });
  const { grid, page } = await openInTad(file);
  await grid.expectRowCount(
    await countOrders("region IN ('North', 'South') AND (quantity < 3 OR quantity > 18)")
  );
  await expect(bar(page).locator(".tui-chipval")).toHaveText([
    "North, South",
    "not 3 – 18, not NULL",
  ]);
});

test("a condition the filter bar can't edit is a fixed chip", async ({ openInTad }) => {
  const file = writeView("chips-fixed.tad", {
    expType: "FilterExp",
    op: "AND",
    opArgs: [bin("GT", "region", "M")],
  });
  const { grid, page } = await openInTad(file);
  await grid.expectRowCount(await countOrders("region > 'M'"));
  const fixed = chip(page, "region");
  await expect(fixed).toHaveClass(/tui-fixed/);
  await fixed.locator(".tui-chipmain").click();
  await expect(popover(page).locator(".tui-cond")).toContainText("'M'");
  await popover(page).getByRole("button", { name: "Remove" }).click();
  await expect(bar(page).locator(".tui-chip")).toHaveCount(0);
  await grid.expectRowCount(N_ROWS);
});

test("brushing a column histogram sets the column's range chip", async ({ openInTad }) => {
  test.skip(GRID_IMPL !== "dom", "brushes the DOM grid's histograms");
  const file = testFile("chips-histograms.tad");
  fs.writeFileSync(
    file,
    tadFile(testFile(PARQUET_FILE), {
      showColumnHistograms: true,
      sortKey: [["order_id", true]],
    })
  );
  const { grid, page } = await openInTad(file);
  const dom = grid as DomGrid;
  await dom.expectRowCount(N_ROWS);
  const qtyCol = await dom.columnIndex("quantity");
  const histo = dom.root.locator(".tad-grid-histogram-cell").nth(qtyCol).locator("svg").first();
  await expect(histo).toBeVisible({ timeout: 30_000 });
  const brush = async (from: number, to: number) => {
    const b = (await histo.boundingBox())!;
    const y = b.y + b.height * 0.55;
    await page.mouse.move(b.x + b.width * from, y);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * to, y, { steps: 5 });
    await page.mouse.up();
  };
  const expectRange = async () => {
    const qty = chip(page, "quantity");
    await expect(qty).toHaveCount(1);
    // Whole numbers, for an integer column:
    await expect(qty.locator(".tui-chipval")).toHaveText(/^\d+ – \d+$/);
    const [lo, hi] = ((await qty.locator(".tui-chipval").textContent()) ?? "")
      .split("–")
      .map((s) => Number(s.trim()));
    await grid.expectRowCount(await countOrders(`quantity BETWEEN ${lo} AND ${hi}`));
    return [lo, hi];
  };
  await brush(0.35, 0.55);
  const first = await expectRange();
  // Brushing again changes the same chip:
  await brush(0.6, 0.8);
  await expect.poll(expectRange).not.toEqual(first);
});
