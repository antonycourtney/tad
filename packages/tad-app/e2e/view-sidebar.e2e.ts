/*
 * The new UI's view settings sidebar (TAD_UI=new): the shelves, the column
 * list's modes and dragging by mouse. Keyboard dragging, and the settings
 * themselves, are covered by view-controls.e2e.ts through the driver.
 */
import { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { PARQUET_FILE, testFile } from "./test-data";
import { UI_IMPL } from "./view-controls";

test.skip(UI_IMPL !== "new", "for the new UI");

const sidebar = (page: Page) => page.getByRole("complementary", { name: "View settings" });

const shelf = (page: Page, name: "Pivot" | "Sort") =>
  sidebar(page).getByRole("group", { name, exact: true });

const shelfOrder = (page: Page, name: "Pivot" | "Sort") =>
  shelf(page, name)
    .locator(".tui-shelfchip")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.column));

const shownOrder = (page: Page) =>
  sidebar(page)
    .locator(".tui-colrow[data-column]:not(.tui-hidden)")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.column));

const mode = async (page: Page, name: string) => {
  await sidebar(page)
    .getByRole("group", { name: "Column list shows" })
    .getByRole("button", { name, exact: true })
    .click();
};

/** Drag one element onto another with the mouse, in small steps (as dnd-kit needs). */
const drag = async (page: Page, from: Locator, to: Locator) => {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      a.x + a.width / 2 + ((b.x - a.x) * i) / steps,
      a.y + a.height / 2 + ((b.y - a.y) * i) / steps
    );
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  // dnd-kit swallows clicks for 50ms after a drop:
  await page.waitForTimeout(100);
};

test("the shelves: remove, flip the sort, drag to reorder", async ({ openInTad }) => {
  const { page, controls, grid } = await openInTad(testFile(PARQUET_FILE));
  await controls.setPivot(["region", "country"]);
  await controls.setSort([["quantity", "desc"]]);

  // The sort arrow flips the direction:
  await shelf(page, "Sort").getByRole("button", { name: "Sort quantity ascending" }).click();
  await expect(
    shelf(page, "Sort").getByRole("button", { name: "Sort quantity descending" })
  ).toBeVisible();

  // Drag country before region:
  await drag(
    page,
    shelf(page, "Pivot").locator('[data-column="country"] .tui-shelfchip-name'),
    shelf(page, "Pivot").locator('[data-column="region"] .tui-shelfchip-name')
  );
  await expect.poll(() => shelfOrder(page, "Pivot")).toEqual(["country", "region"]);
  await expect(page.locator('.tad-grid-header-cell[data-col-id="_pivot"]')).toContainText(
    "country > region"
  );

  // × removes:
  await shelf(page, "Pivot").getByRole("button", { name: "Remove country from the pivot" }).click();
  await expect.poll(() => shelfOrder(page, "Pivot")).toEqual(["region"]);
  await shelf(page, "Sort").getByRole("button", { name: "Remove quantity from the sort" }).click();
  await expect(shelf(page, "Sort")).toContainText("Not sorted");
  await expect.poll(() => grid.rowCount()).toBe(5);
});

test("the column list: drag to reorder, show all, search", async ({ openInTad }) => {
  const { page, controls, grid } = await openInTad(testFile(PARQUET_FILE));
  await controls.openViewSettings();
  const before = (await shownOrder(page)) as string[];
  const row = (c: string) => sidebar(page).locator(`.tui-colrow[data-column="${c}"]`);

  // Drag quantity (by its grip) above region:
  await row("quantity").hover();
  await drag(page, row("quantity").locator(".tui-grip"), row("region"));
  const moved = before.filter((c) => c !== "quantity");
  moved.splice(moved.indexOf("region"), 0, "quantity");
  await expect.poll(() => shownOrder(page)).toEqual(moved);
  await expect.poll(() => grid.columnIds()).toEqual(moved);

  // With one column hidden, "all" is mixed; a click shows every column:
  const all = sidebar(page).getByRole("button", { name: "Show all columns" });
  await controls.setShown("note", false);
  await expect(all).toHaveAttribute("aria-pressed", "mixed");
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => grid.columnIds()).toContain("note");

  // Search narrows the list, and rows can't be dragged while searching:
  await sidebar(page).getByRole("textbox", { name: "Find a column" }).fill("ord");
  await expect.poll(() => shownOrder(page)).toEqual(["order_id", "order_url"]);
  await expect(row("order_id").locator(".tui-grip")).not.toHaveAttribute("aria-roledescription");
  await sidebar(page).getByRole("textbox", { name: "Find a column" }).fill("zzz");
  await expect(sidebar(page)).toContainText("No columns match");
});

test("aggregation and format modes mark what's changed", async ({ openInTad }) => {
  const { page, controls } = await openInTad(testFile(PARQUET_FILE));
  await controls.openViewSettings();

  await mode(page, "Aggregation");
  const agg = sidebar(page).getByRole("combobox", { name: "Aggregate quantity with" });
  await expect(agg).toHaveValue("sum");
  await expect(agg).not.toHaveClass(/tui-changed/);
  await agg.selectOption("max");
  await expect(agg).toHaveClass(/tui-changed/);

  await mode(page, "Format");
  const revenue = sidebar(page).locator('[data-format="column:revenue"]');
  await expect(revenue.locator(".tui-owndot")).toHaveCount(0);
  await controls.setColumnNumberFormat("revenue", { method: "custom", decimals: 1 });
  await mode(page, "Format");
  await expect(revenue.locator(".tui-owndot")).toHaveCount(1);
  await expect(revenue.locator(".tui-fmtsample")).toHaveText(/\.\d$/);

  // The Real default is used by the other real column:
  await sidebar(page).locator('[data-format="default:real"]').click();
  await expect(page.locator(".tui-pop")).toContainText("Used by 1 column");
});

test("leaf row labels are for pivoted views", async ({ openInTad }) => {
  const { page, controls } = await openInTad(testFile(PARQUET_FILE));
  await controls.openViewSettings();
  const leaf = sidebar(page).getByRole("combobox", { name: "Label leaf rows with" });
  await expect(leaf).toBeDisabled();
  await controls.setPivot(["region"]);
  await expect(leaf).toBeEnabled();
});
