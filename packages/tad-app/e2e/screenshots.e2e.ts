/*
 * Screenshots of the grid, for looking at its styling. Not part of the normal
 * test run: set SCREENSHOTS=1. Images go to e2e-results/screenshots/.
 */
import * as fs from "fs";
import * as path from "path";
import { expect, GRID_IMPL, test } from "./fixtures";
import {
  ensureWideTable,
  PARQUET_FILE,
  PIVOT_TAD_FILE,
  SORTED_TAD_FILE,
  tadFile,
  testFile,
} from "./test-data";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to take screenshots");

const shot = (name: string) =>
  path.resolve(__dirname, "..", "e2e-results", "screenshots", `${GRID_IMPL}-${name}.png`);

const windowSize = { width: 1280, height: 720 };

test("flat table with a selection", async ({ openInTad }) => {
  const { grid, page } = await openInTad(testFile(SORTED_TAD_FILE), { windowSize });
  await grid.expectCellText(0, 0, "0");
  await grid.clickCell(1, 2);
  await grid.clickCell(3, 4, ["Shift"]);
  await page.mouse.move(400, 500);
  await page.screenshot({ path: shot("flat") });
});

test("pivot", async ({ openInTad }) => {
  const { grid, page } = await openInTad(testFile(PIVOT_TAD_FILE), { windowSize });
  await grid.expectRowCount(6);
  await grid.clickCell(0, 2);
  await grid.expectRowCount(26);
  await grid.clickCell(0, 3);
  await expect.poll(() => grid.rowCount()).toBeGreaterThan(26);
  await page.screenshot({ path: shot("pivot") });
});

test("wide table", async ({ openInTad }) => {
  const file = await ensureWideTable();
  const { grid, page } = await openInTad(file, { windowSize });
  await grid.clickCell(2, 1);
  await page.screenshot({ path: shot("wide") });
});

test("column histograms", async ({ openInTad }) => {
  const file = testFile("orders-histograms.tad");
  fs.writeFileSync(
    file,
    tadFile(testFile(PARQUET_FILE), {
      showColumnHistograms: true,
      sortKey: [["order_id", true]],
    })
  );
  const { grid, page } = await openInTad(file, { windowSize });
  await grid.expectCellText(0, 0, "0");
  await page.waitForSelector(".tad-grid-histogram-cell svg, .slick-headerrow svg", {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("histograms") });
});
