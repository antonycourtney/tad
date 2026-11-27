/*
 * Screenshots of the grid, for looking at its styling. Not part of the normal
 * test run: set SCREENSHOTS=1. Images go to e2e-screenshots/ (which, unlike
 * e2e-results/, isn't cleared by the next test run).
 */
import * as fs from "fs";
import * as path from "path";
import { expect, GRID_IMPL, test } from "./fixtures";
import { UI_IMPL } from "./view-controls";
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
  path.resolve(__dirname, "..", "e2e-screenshots", `${GRID_IMPL}-${name}.png`);

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

test("pivot scrolled sideways, with a header hovered", async ({ openInTad }) => {
  const { grid, page } = await openInTad(testFile(PIVOT_TAD_FILE), {
    windowSize: { width: 640, height: 420 },
  });
  await grid.expectRowCount(6);
  await grid.clickCell(0, 2);
  await grid.expectRowCount(26);
  await page.locator(".tad-grid-scroller").evaluate((el) => (el.scrollLeft = 120));
  const b = await grid.bounds(3, -1);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot("pivot-scrolled") });
});

test("rows loading", async ({ openInTad }) => {
  const { grid, page } = await openInTad(testFile(SORTED_TAD_FILE), { windowSize });
  await grid.expectCellText(0, 0, "0");
  // Show some rows as if their data hadn't arrived yet:
  await page.evaluate(() => {
    for (const row of Array.from(document.querySelectorAll<HTMLElement>("[data-row]"))) {
      if (Number(row.dataset.row) >= 6) {
        row.classList.add("tad-grid-loading-row");
        row.querySelectorAll("[role=gridcell]").forEach((c) => (c.textContent = ""));
      }
    }
  });
  await page.mouse.move(5, 700);
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("loading") });
});

// --- the new UI (TAD_UI=new) ---

test.describe("filter bar", () => {
  test.skip(UI_IMPL !== "new", "for the new UI: set TAD_UI=new");

  const popover = ".tui-pop:not(.tui-narrow)";

  test("values and ranges", async ({ openInTad }) => {
    const { grid, page, controls } = await openInTad(testFile(SORTED_TAD_FILE), {
      windowSize,
    });
    await grid.expectCellText(0, 0, "0");
    await controls.setFilter("all", [
      { column: "region", op: "NOTIN", value: ["West"] },
      { column: "quantity", op: "GE", value: 5 },
      { column: "note", op: "CONTAINS", value: "99" },
    ]);
    await page.mouse.move(5, 700);
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("filter-bar") });

    await page.locator('.tui-chip[data-column="region"] .tui-chipmain').click();
    await expect(page.locator(`${popover} .tui-vrow[data-value="North"]`)).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("filter-values") });
    await page.keyboard.press("Escape");

    await page.locator('.tui-chip[data-column="quantity"] .tui-chipmain').click();
    await expect(page.locator(`${popover} .tui-haxis`)).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("filter-range") });
    await page.keyboard.press("Escape");

    await page.locator('.tui-chip[data-column="note"] .tui-chipmain').click();
    await expect(page.locator(`${popover} .tui-static`).first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("filter-match") });
    await page.keyboard.press("Escape");

    await page.locator(".tui-filterbar .tui-addbtn").click();
    await expect(page.locator(".tui-narrow .tui-mi").first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("filter-add") });
  });
});

test.describe("header menu", () => {
  test.skip(UI_IMPL !== "new" || GRID_IMPL !== "dom", "for the new UI and the DOM grid");

  test("menu", async ({ openInTad }) => {
    const { grid, page } = await openInTad(testFile(SORTED_TAD_FILE), { windowSize });
    await grid.expectCellText(0, 0, "0");
    const header = page.locator('.tad-grid-header-cell[data-col-id="quantity"]');
    await header.hover();
    await header.getByRole("button", { name: "quantity column menu" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("header-menu") });
  });
});

test.describe("data sources", () => {
  test.skip(UI_IMPL !== "new", "for the new UI: set TAD_UI=new");

  test("panel", async ({ openInTad }) => {
    const dir = path.dirname(testFile(PARQUET_FILE));
    const { page, grid } = await openInTad(dir, { windowSize, waitForData: false });
    const panel = page.getByRole("complementary", { name: "Data sources" });
    await panel.getByRole("treeitem", { name: new RegExp(PARQUET_FILE) }).click();
    await grid.waitForData();
    await page.mouse.move(700, 700);
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("data-sources") });
  });
});

test.describe("view sidebar", () => {
  test.skip(UI_IMPL !== "new", "for the new UI: set TAD_UI=new");

  test("layout, aggregation and format", async ({ openInTad }) => {
    const { page, controls } = await openInTad(testFile(SORTED_TAD_FILE), { windowSize });
    await controls.setPivot(["region", "country"]);
    await controls.setShown("note", false);
    await controls.setAggregation("unit_price", "avg");
    const sidebar = page.getByRole("complementary", { name: "View settings" });
    const mode = (name: string) =>
      sidebar
        .getByRole("group", { name: "Column list shows" })
        .getByRole("button", { name, exact: true })
        .click();
    await mode("Layout");
    await page.mouse.move(700, 700);
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("sidebar-layout") });

    await mode("Aggregation");
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("sidebar-aggregation") });

    await mode("Format");
    await sidebar.locator('[data-format="default:real"]').click();
    await expect(page.locator(".tui-pop .tui-preview")).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("sidebar-format") });
  });
});

test.describe("dialogs", () => {
  test.skip(UI_IMPL !== "new", "for the new UI: set TAD_UI=new");

  test("export", async ({ openInTad }, testInfo) => {
    const { app, page, controls } = await openInTad(testFile(SORTED_TAD_FILE), { windowSize });
    await controls.setPivot(["region"]);
    await app.evaluate(({ BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("open-export-begin-dialog", { openState: true });
      }
    });
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: /export to file/i })
      .fill(testInfo.outputPath("orders.parquet"));
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("dialog-export") });
    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByRole("dialog").filter({ hasText: "Exported" })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("dialog-exported") });
  });
});

