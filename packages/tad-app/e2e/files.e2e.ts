/*
 * Opening saved .tad files.
 */
import * as fs from "fs";
import { ElectronApplication } from "@playwright/test";
import { expect, test } from "./fixtures";
import { countOrders, PARQUET_FILE, tadFile, testFile } from "./test-data";

/** Error dialogs Tad has shown (recorded, with TAD_TEST_HOOKS=1). */
const errorDialogs = (app: ElectronApplication) =>
  app.evaluate(() => (global as any).__tadErrorDialogs ?? []);

const writeTadFile = (name: string, viewParams: object, version?: number): string => {
  const file = testFile(name);
  const json = JSON.parse(tadFile(testFile(PARQUET_FILE), viewParams));
  if (version !== undefined) {
    json.tadFileFormatVersion = version;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
  return file;
};

const col = (colName: string) => ({ expType: "ColRef", colName });
const val = (v: any) => ({ expType: "ConstVal", val: v });
const bin = (op: string, c: string, v: any) => ({
  expType: "BinRelExp",
  op,
  lhs: col(c),
  rhs: val(v),
});

test("a saved view with nested filters loads", async ({ openInTad }) => {
  // (region is North or South) and (quantity < 3 or quantity > 18):
  const filterExp = {
    expType: "FilterExp",
    op: "AND",
    opArgs: [
      { expType: "FilterExp", op: "OR", opArgs: [bin("EQ", "region", "North"), bin("EQ", "region", "South")] },
      { expType: "FilterExp", op: "OR", opArgs: [bin("LT", "quantity", 3), bin("GT", "quantity", 18)] },
    ],
  };
  const file = writeTadFile("nested-filter.tad", { filterExp }, 4);
  const { app, grid } = await openInTad(file);
  await grid.expectRowCount(
    await countOrders("region IN ('North', 'South') AND (quantity < 3 OR quantity > 18)")
  );
  expect(await errorDialogs(app)).toEqual([]);
});

test("a file from a newer version of Tad opens, with a warning", async ({ openInTad }) => {
  const file = writeTadFile("from-the-future.tad", { sortKey: [["order_id", true]] }, 99);
  const { app, grid } = await openInTad(file);
  await grid.expectCellText(await grid.columnIndex("order_id"), 0, "0");
  await expect
    .poll(() => errorDialogs(app))
    .toEqual([expect.objectContaining({ title: "Saved by a newer version of Tad", fatal: false })]);
});
