/*
 * The new UI's data sources panel (TAD_UI=new), on a folder: opening a
 * file from it, the search, and moving around by keyboard.
 */
import * as path from "path";
import { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { N_ROWS, PARQUET_FILE, testFile } from "./test-data";
import { UI_IMPL } from "./view-controls";

test.skip(UI_IMPL !== "new", "for the new UI");

const panel = (page: Page) => page.getByRole("complementary", { name: "Data sources" });
const items = (page: Page) => panel(page).getByRole("treeitem");
const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent);

test("opens a file from a folder, and highlights it", async ({ openInTad }) => {
  const dir = path.dirname(testFile(PARQUET_FILE));
  const { page, grid } = await openInTad(dir, { waitForData: false });
  await expect(panel(page)).toHaveClass(/sidebar-expanded/);
  await expect(page.getByRole("button", { name: "Data sources" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  const folder = items(page).first();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(folder).toContainText(path.basename(dir));
  const file = panel(page).getByRole("treeitem", { name: new RegExp(PARQUET_FILE) });
  await expect(file).toHaveAttribute("aria-level", "2");
  await expect(file).toHaveAttribute("aria-selected", "false");

  await file.click();
  await grid.waitForData();
  await grid.expectRowCount(N_ROWS);
  await expect(file).toHaveAttribute("aria-selected", "true");

  // The search keeps the folder a match is in:
  const search = panel(page).getByRole("textbox", { name: "Find a table or file" });
  await search.fill("PARQUET");
  await expect(items(page)).toHaveCount(2);
  await search.fill("no such file");
  await expect(items(page)).toHaveCount(0);
  await expect(panel(page)).toContainText("Nothing loaded matches");
  await search.fill("");

  // The keyboard: down, up, collapse, expand.
  await folder.focus();
  await page.keyboard.press("ArrowDown");
  expect(await focusedText(page)).toBe(PARQUET_FILE);
  await page.keyboard.press("ArrowLeft");
  expect(await focusedText(page)).toContain(path.basename(dir));
  await page.keyboard.press("ArrowLeft");
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await expect(items(page)).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(items(page)).toHaveCount(2);

  // The active button hides the sidebar:
  await page.getByRole("button", { name: "Data sources" }).click();
  await expect(panel(page)).toHaveClass(/sidebar-collapsed/);
});

test("asks before replacing a view that has changed", async ({ openInTad }) => {
  const dir = path.dirname(testFile(PARQUET_FILE));
  const { page, grid, controls } = await openInTad(dir, { waitForData: false });
  const file = panel(page).getByRole("treeitem", { name: new RegExp(PARQUET_FILE) });
  await file.click();
  await grid.waitForData();
  await controls.setShown("note", false);
  await expect.poll(() => grid.columnIds()).not.toContain("note");

  await page.getByRole("button", { name: "Data sources" }).click();
  await file.click();
  const dialog = page.getByRole("dialog", { name: "Open table" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect.poll(() => grid.columnIds()).not.toContain("note");

  await file.click();
  await dialog.getByRole("button", { name: "Replace this view" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => grid.columnIds()).toContain("note");
});

