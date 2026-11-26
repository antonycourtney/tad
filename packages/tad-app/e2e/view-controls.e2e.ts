/*
 * The controls around the grid: the sidebar (columns, pivot, sort,
 * aggregations, formats) and the filter. Tests drive them through
 * ViewControls (view-controls.ts), so they run against each UI (TAD_UI),
 * and check what the grid shows.
 */
import { DomGrid } from "./dom-grid";
import { expect, GRID_IMPL, test } from "./fixtures";
import { GridDriver } from "./grid-driver";
import {
  COLUMNS,
  countOrders,
  N_ROWS,
  PARQUET_FILE,
  PIVOT_TAD_FILE,
  queryOrders,
  REGIONS,
  SORTED_TAD_FILE,
  testFile,
} from "./test-data";
import { UI_IMPL } from "./view-controls";

const expectColumns = async (grid: GridDriver, check: (ids: string[]) => void) =>
  expect.poll(async () => {
    try {
      check(await grid.columnIds());
      return true;
    } catch (e) {
      return false;
    }
  }).toBe(true);

test.describe("sidebar", () => {
  test("hides and shows a column", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(SORTED_TAD_FILE));
    await controls.setShown("note", false);
    await expectColumns(grid, (ids) => expect(ids).not.toContain("note"));
    await controls.setShown("note", true);
    await expectColumns(grid, (ids) => expect(ids).toContain("note"));
  });

  test("hides every column, then shows them all", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(SORTED_TAD_FILE));
    await controls.setAllShown(false);
    await expectColumns(grid, (ids) => expect(ids).toEqual([]));
    await controls.setAllShown(true);
    await expectColumns(grid, (ids) => expect(ids).toEqual(expect.arrayContaining(COLUMNS)));
  });

  test("moves a column", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(SORTED_TAD_FILE));
    await controls.moveColumnBefore("note", "order_id");
    await expect.poll(async () => (await grid.columnIds())[0]).toBe("note");
  });

  test("pivots by two columns, then stops pivoting", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(SORTED_TAD_FILE));
    await controls.setPivot(["region", "country"]);
    // One row per region (no totals row in this view), in order of
    // sum(order_id), as the view is sorted by order_id:
    await grid.expectRowCount(REGIONS.length);
    for (const [i, region] of REGIONS.entries()) {
      await grid.expectCellText(0, i, region);
    }
    // Expanding a region shows its countries, the second pivot level:
    await grid.clickCell(0, 0);
    await grid.expectCellText(0, 1, "Country 00");

    await controls.setPivot([]);
    await grid.expectRowCount(N_ROWS);
  });

  test("sorts by two columns", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PARQUET_FILE));
    const regionCol = await grid.columnIndex("region");
    const qtyCol = await grid.columnIndex("quantity");
    await controls.setSort([
      ["region", "asc"],
      ["quantity", "desc"],
    ]);
    await grid.expectCellText(regionCol, 0, "Central");
    await grid.expectCellText(qtyCol, 0, "20");

    await controls.setSort([["quantity", "asc"]]);
    await grid.expectCellText(qtyCol, 0, "1");
  });

  test("changes how a column aggregates", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PIVOT_TAD_FILE));
    const qtyCol = await grid.columnIndex("quantity");
    // Row 0 is the totals row; quantity is summed by default:
    const sum = await queryOrders("sum(quantity)");
    await grid.expectCellText(qtyCol, 0, sum.toLocaleString("en-US"));

    await controls.setAggregation("quantity", "max");
    await grid.expectCellText(qtyCol, 0, "20");
    await controls.setAggregation("quantity", "min");
    await grid.expectCellText(qtyCol, 0, "1");
  });

  test("labels pivot tree leaves with a column", async ({ openInTad }) => {
    // Pivoted by region > country, with product as the leaf column:
    const { grid, controls } = await openInTad(testFile(PIVOT_TAD_FILE));
    await grid.clickCell(0, 1); // North
    await grid.expectCellText(0, 2, "Country 00");
    await grid.clickCell(0, 2);
    // The first leaf is order 0:
    await grid.expectCellText(0, 3, "Product 00");

    await controls.setLeafColumn("note");
    await grid.expectCellText(0, 3, "Order note 0");
    await controls.setLeafColumn(null);
    await grid.expectCellText(0, 3, "");
  });

  test("shows and hides the totals row", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PIVOT_TAD_FILE));
    await grid.expectRowCount(1 + REGIONS.length);
    await controls.setShowTotalsRow(false);
    await grid.expectRowCount(REGIONS.length);
    await grid.expectCellText(0, 0, REGIONS[0]);
    await controls.setShowTotalsRow(true);
    await grid.expectRowCount(1 + REGIONS.length);
  });

  test("shows and hides column histograms", async ({ openInTad }) => {
    test.skip(GRID_IMPL !== "dom", "DOM grid only");
    const { page, controls } = await openInTad(testFile(SORTED_TAD_FILE));
    const histograms = page.locator(".tad-grid-histogram-cell svg");
    await expect(histograms).toHaveCount(0);
    await controls.setShowHistograms(true);
    await expect(histograms.first()).toBeVisible({ timeout: 30_000 });
    await controls.setShowHistograms(false);
    await expect(histograms).toHaveCount(0);
  });
});

test.describe("formats", () => {
  // Order 1: unit_price 362.61, revenue 4351.32.
  test("sets the default format for real numbers", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(SORTED_TAD_FILE));
    const priceCol = await grid.columnIndex("unit_price");
    const revenueCol = await grid.columnIndex("revenue");
    await grid.expectCellText(revenueCol, 1, "4,351.32");

    await controls.setDefaultNumberFormat("real", {
      method: "custom",
      decimals: 1,
      commas: false,
    });
    await grid.expectCellText(revenueCol, 1, "4351.3");
    await grid.expectCellText(priceCol, 1, "362.6");
  });

  test("a column's own format overrides the default", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(SORTED_TAD_FILE));
    const priceCol = await grid.columnIndex("unit_price");
    const revenueCol = await grid.columnIndex("revenue");
    await controls.setColumnNumberFormat("revenue", { method: "custom", decimals: 0 });
    await grid.expectCellText(revenueCol, 1, "4,351");
    await grid.expectCellText(priceCol, 1, "362.61");
  });

  test("sets the default format for integers", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PIVOT_TAD_FILE));
    const idCol = await grid.columnIndex("order_id");
    // The totals row's sum of order_id:
    await grid.expectCellText(idCol, 0, "4,999,950,000");
    await controls.setDefaultNumberFormat("integer", { commas: false });
    await grid.expectCellText(idCol, 0, "4999950000");
  });

  test("shows URLs as plain text", async ({ openInTad }) => {
    test.skip(GRID_IMPL !== "dom", "DOM grid only");
    const { grid, controls } = await openInTad(testFile(SORTED_TAD_FILE));
    const dom = grid as DomGrid;
    const urlCol = await dom.columnIndex("order_url");
    await expect(dom.cell(urlCol, 0).locator("a")).toHaveCount(1);
    await controls.setColumnTextFormat("order_url", { urlsAsLinks: false });
    await expect(dom.cell(urlCol, 0).locator("a")).toHaveCount(0);
    await dom.expectCellText(urlCol, 0, "https://example.com/orders/0");
  });
});

test.describe("filter", () => {
  test("keeps rows whose value is, or isn't, in a list", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PARQUET_FILE));
    await controls.setFilter("all", [
      { column: "region", op: "IN", value: ["North", "South"] },
    ]);
    await grid.expectRowCount(40_000);
    await controls.setFilter("all", [{ column: "region", op: "NOTIN", value: ["North"] }]);
    await grid.expectRowCount(80_000);
  });

  test("matches text", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PARQUET_FILE));
    const cases: [string, string, string][] = [
      ["CONTAINS", "999", "note ILIKE '%999%'"],
      ["BEGINS", "Order note 12", "note ILIKE 'Order note 12%'"],
      ["NOTENDS", "0", "note NOT ILIKE '%0'"],
    ];
    for (const [op, value, where] of cases) {
      await controls.setFilter("all", [{ column: "note", op: op as any, value }]);
      await grid.expectRowCount(await countOrders(where));
    }
  });

  test("compares numbers", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PARQUET_FILE));
    // Each quantity from 1 to 20 is in 5,000 rows:
    const cases: [string, number, number][] = [
      ["GE", 15, 30_000],
      ["EQ", 3, 5_000],
      ["NEQ", 3, 95_000],
      ["LT", 2, 5_000],
    ];
    for (const [op, value, expected] of cases) {
      await controls.setFilter("all", [{ column: "quantity", op: op as any, value }]);
      await grid.expectRowCount(expected);
    }
  });

  test("keeps rows with, or without, a value", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PARQUET_FILE));
    // order_url is NULL in 3 of every 4 rows:
    await controls.setFilter("all", [{ column: "order_url", op: "ISNULL" }]);
    await grid.expectRowCount(75_000);
    await controls.setFilter("all", [{ column: "order_url", op: "NOTNULL" }]);
    await grid.expectRowCount(25_000);
  });

  test("combines conditions with all or any", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PARQUET_FILE));
    const conditions = [
      { column: "region", op: "EQ" as const, value: "North" },
      { column: "quantity", op: "GE" as const, value: 15 },
    ];
    await controls.setFilter("all", conditions);
    await grid.expectRowCount(await countOrders("region = 'North' AND quantity >= 15"));
    await controls.setFilter("any", conditions);
    await grid.expectRowCount(await countOrders("region = 'North' OR quantity >= 15"));

    await controls.clearFilter();
    await grid.expectRowCount(N_ROWS);
  });

  test("a NOT IN filter and NULLs", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PARQUET_FILE));
    await controls.setFilter("all", [
      { column: "order_url", op: "NOTIN", value: ["https://example.com/orders/0"] },
    ]);
    // The Blueprint UI's NOT IN is plain SQL, which drops rows where the
    // column is NULL. The new UI keeps them (see doc/ui-todo.md).
    await grid.expectRowCount(UI_IMPL === "blueprint" ? 24_999 : N_ROWS - 1);
  });

  test("cancelling an edit puts the filter back", async ({ openInTad }) => {
    const { grid, controls } = await openInTad(testFile(PARQUET_FILE));
    await controls.setFilter("all", [{ column: "quantity", op: "GE", value: 15 }]);
    await grid.expectRowCount(30_000);
    await controls.previewFilter("all", [{ column: "quantity", op: "GE", value: 19 }]);
    await grid.expectRowCount(10_000);
    await controls.cancelFilterEdit();
    await grid.expectRowCount(30_000);
  });
});
