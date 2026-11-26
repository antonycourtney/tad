/*
 * Exporting the filtered rows (both UIs). The test opens the export dialog
 * as the File menu's Export does, by a message from the main process.
 */
import * as fs from "fs";
import { expect, test } from "./fixtures";
import { N_ROWS, PARQUET_FILE, REGIONS, testFile } from "./test-data";
import { UI_IMPL } from "./view-controls";

test("exports the filtered rows to CSV", async ({ openInTad }, testInfo) => {
  const { app, page, controls } = await openInTad(testFile(PARQUET_FILE));
  await controls.setFilter("all", [{ column: "region", op: "IN", value: ["North"] }]);
  const rows = N_ROWS / REGIONS.length;
  const rowsText = rows.toLocaleString("en-US");

  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("open-export-begin-dialog", { openState: true });
    }
  });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`Export ${rowsText} rows`);
  if (UI_IMPL === "new") {
    await dialog.getByRole("button", { name: "CSV", exact: true }).click();
    await expect(dialog.getByRole("combobox")).toHaveCount(0); // (Parquet's compression)
  } else {
    await dialog.getByRole("combobox", { name: "File Format" }).selectOption("csv");
  }
  const out = testInfo.outputPath("north.csv");
  await dialog.getByRole("textbox", { name: /export to file/i }).fill(out);
  await dialog.getByRole("button", { name: "Export", exact: true }).click();

  const done = page.getByRole("dialog").filter({ hasText: `Exported ${rowsText} rows` });
  await expect(done).toBeVisible({ timeout: 30_000 });
  await done.getByRole("button", { name: "OK" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const lines = fs.readFileSync(out, "utf8").trim().split("\n");
  expect(lines).toHaveLength(rows + 1);
  expect(lines[0]).toContain("region");
});
