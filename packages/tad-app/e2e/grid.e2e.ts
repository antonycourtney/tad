import { expect, test } from "./fixtures";
import { digits } from "./glide-grid";
import {
  COLUMNS,
  COUNTRIES_PER_REGION,
  N_ROWS,
  PARQUET_FILE,
  PIVOT_TAD_FILE,
  REC_COLUMN,
  REGIONS,
  ROWS_PER_COUNTRY,
  SORTED_TAD_FILE,
  testFile,
} from "./test-data";

test.describe("flat table", () => {
  test("opens a Parquet file", async ({ openInTad }) => {
    const { grid } = await openInTad(testFile(PARQUET_FILE));
    await grid.expectRowCount(N_ROWS);
    expect(await grid.columnIds()).toEqual([...COLUMNS, REC_COLUMN]);
    expect(await grid.headerTitles()).toEqual([...COLUMNS, REC_COLUMN]);
  });

  test("sorts by clicking a column header", async ({ openInTad }) => {
    const { grid } = await openInTad(testFile(PARQUET_FILE));
    const col = await grid.columnIndex("quantity");

    await grid.clickHeader(col);
    await expect.poll(async () => (await grid.headerTitles())[col]).toBe("quantity ▲");
    await grid.expectCellText(col, 0, "1");

    await grid.clickHeader(col);
    await expect.poll(async () => (await grid.headerTitles())[col]).toBe("quantity ▼");
    await grid.expectCellText(col, 0, "20");
  });

  test("scrolls to the last row", async ({ openInTad }) => {
    const { grid } = await openInTad(testFile(SORTED_TAD_FILE));
    await grid.expectCellText(0, 0, "0");

    await grid.scrollTo(0, N_ROWS - 1);
    await expect
      .poll(async () => digits((await grid.cellText(0, N_ROWS - 1)) ?? ""))
      .toBe(String(N_ROWS - 1));
  });

  test("copies selected cells as tab-separated values", async ({ openInTad }) => {
    const { grid } = await openInTad(testFile(SORTED_TAD_FILE));
    await grid.expectCellText(0, 0, "0");

    await grid.clickCell(0, 0);
    await grid.clickCell(1, 2, ["Shift"]);
    expect(await grid.copySelection()).toBe("0\tNorth\n1\tSouth\n2\tEast");
  });

  test("resizes and reorders columns", async ({ openInTad }) => {
    const { grid } = await openInTad(testFile(SORTED_TAD_FILE));
    const col = await grid.columnIndex("quantity");

    const before = (await grid.bounds(col, -1)).width;
    await grid.resizeColumn(col, 80);
    await expect
      .poll(async () => (await grid.bounds(col, -1)).width)
      .toBeGreaterThan(before + 60);

    await grid.moveColumn(col, 0);
    await expect.poll(() => grid.columnIds()).toEqual([
      "quantity",
      ...COLUMNS.filter((c) => c !== "quantity"),
    ]);
  });
});

test.describe("pivot tree", () => {
  test("expands and collapses groups", async ({ openInTad }) => {
    const { grid } = await openInTad(testFile(PIVOT_TAD_FILE));
    const orderIdCol = await grid.columnIndex("order_id");

    // Root row, then one row per region:
    const collapsedRows = 1 + REGIONS.length;
    await grid.expectRowCount(collapsedRows);
    for (const [i, region] of REGIONS.entries()) {
      await grid.expectCellText(0, i + 1, region);
    }

    // Expand South (row 2), then its first country:
    await grid.clickCell(0, 2);
    await grid.expectRowCount(collapsedRows + COUNTRIES_PER_REGION);
    await grid.expectCellText(0, 3, "Country 00");

    await grid.clickCell(0, 3);
    await grid.expectRowCount(collapsedRows + COUNTRIES_PER_REGION + ROWS_PER_COUNTRY);
    // First leaf row: orders in South (i % 5 == 1), Country 00, by order_id:
    await grid.expectCellText(orderIdCol, 4, "1");

    // Collapse South:
    await grid.clickCell(0, 2);
    await grid.expectRowCount(collapsedRows);
    await grid.expectCellText(0, 3, "East");
  });
});
