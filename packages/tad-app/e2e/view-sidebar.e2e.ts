/*
 * The new UI's view settings sidebar (TAD_UI=new): the shelves, the column
 * list's modes and dragging by mouse. Keyboard dragging, and the settings
 * themselves, are covered by view-controls.e2e.ts through the driver.
 */
import { Locator, Page } from "@playwright/test";
import { expect, GRID_IMPL, test } from "./fixtures";
import { ensureWideTable, PARQUET_FILE, testFile, WIDE_PARQUET_FILE } from "./test-data";
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

/** Check the pivot column's title (which only the DOM grid's header shows). */
const expectPivotTitle = async (page: Page, text: string) => {
  if (GRID_IMPL === "dom") {
    await expect(page.locator('.tad-grid-header-cell[data-col-id="_pivot"]')).toContainText(text);
  }
};

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

  // The column list's boxes show each column's place in the pivot, and the
  // shelves join their chips with "›" and "then":
  await expect(sidebar(page).getByRole("button", { name: "Pivot by country" })).toHaveText("2");
  await expect(shelf(page, "Pivot")).toContainText("region›country");
  await expect(shelf(page, "Sort").getByRole("button", { name: /^Sort quantity/ })).toHaveText(
    "desc"
  );

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
  await expectPivotTitle(page, "country › region");

  // × removes:
  await shelf(page, "Pivot").getByRole("button", { name: "Remove country from the pivot" }).click();
  await expect.poll(() => shelfOrder(page, "Pivot")).toEqual(["region"]);
  await shelf(page, "Sort").getByRole("button", { name: "Remove quantity from the sort" }).click();
  await expect(shelf(page, "Sort")).toContainText("click Sort below");
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

  // Search narrows the list:
  const search = sidebar(page).getByRole("textbox", { name: "Find a column" });
  await search.fill("ord");
  await expect.poll(() => shownOrder(page)).toEqual(["order_id", "order_url"]);
  await search.fill("zzz");
  await expect(sidebar(page)).toContainText("No columns match");
});

test("drag a column onto a shelf", async ({ openInTad }) => {
  const { page, controls } = await openInTad(testFile(PARQUET_FILE));
  await controls.openViewSettings();
  const row = (c: string) => sidebar(page).locator(`.tui-colrow[data-column="${c}"]`);
  const search = sidebar(page).getByRole("textbox", { name: "Find a column" });

  // Onto the empty Pivot shelf, from a search:
  await search.fill("coun");
  await drag(page, row("country").locator(".tui-grip"), shelf(page, "Pivot"));
  await expect.poll(() => shelfOrder(page, "Pivot")).toEqual(["country"]);
  await expectPivotTitle(page, "country");
  await search.fill("");

  // Onto a chip, which puts it before that chip:
  await drag(
    page,
    row("region").locator(".tui-grip"),
    shelf(page, "Pivot").locator('[data-column="country"]')
  );
  await expect.poll(() => shelfOrder(page, "Pivot")).toEqual(["region", "country"]);
  await expectPivotTitle(page, "region › country");

  // Onto the Sort shelf, ascending:
  await drag(page, row("quantity").locator(".tui-grip"), shelf(page, "Sort"));
  await expect.poll(() => shelfOrder(page, "Sort")).toEqual(["quantity"]);
  await expect(sidebar(page).getByRole("button", { name: "Sort by quantity" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
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
  await expect(page.locator(".tui-pop")).toContainText("Used by 1 real column");
});

test("leaf row labels are for pivoted views, under the Pivot shelf", async ({ openInTad }) => {
  const { page, controls } = await openInTad(testFile(PARQUET_FILE));
  await controls.openViewSettings();
  const leaf = sidebar(page).getByRole("combobox", { name: "Label leaf rows with" });
  await expect(leaf).toHaveCount(0);
  await controls.setPivot(["region"]);
  await expect(leaf).toBeVisible();
  const box = async (l: Locator) => (await l.boundingBox())!;
  const [pivot, label, sort] = [
    await box(shelf(page, "Pivot")),
    await box(leaf),
    await box(shelf(page, "Sort")),
  ];
  expect(label.y).toBeGreaterThan(pivot.y + pivot.height);
  expect(label.y + label.height).toBeLessThan(sort.y);
  await controls.setPivot([]);
  await expect(leaf).toHaveCount(0);
});

test("the column lists can be A to Z", async ({ openInTad }) => {
  const { page, controls } = await openInTad(testFile(PARQUET_FILE));
  await controls.openViewSettings();
  const listed = () =>
    sidebar(page)
      .getByRole("list", { name: "Columns" })
      .locator(".tui-colrow[data-column]")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.column));
  const tableOrder = (await listed()) as string[];
  const az = [...tableOrder].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  expect(tableOrder).not.toEqual(az);

  const toggle = sidebar(page).getByRole("button", { name: "List columns A to Z" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(listed).toEqual(az);
  // A to Z, rows go onto the shelves but don't reorder the grid's columns:
  await expect(
    sidebar(page).getByRole("button", { name: "Drag quantity onto Pivot or Sort" })
  ).toBeVisible();
  // Searching keeps the order:
  await sidebar(page).getByRole("textbox", { name: "Find a column" }).fill("r");
  await expect.poll(listed).toEqual(az.filter((c) => c.toLowerCase().includes("r")));
  await sidebar(page).getByRole("textbox", { name: "Find a column" }).fill("");

  // "Filter by column" lists the columns the same way, and can switch back:
  await page.locator(".tui-filterbar .tui-addbtn").click();
  const pop = page.getByRole("dialog", { name: "Filter by column" });
  const offered = () =>
    pop.getByRole("menuitem").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.column));
  await expect.poll(offered).toEqual(az);
  await pop.getByRole("button", { name: "List columns A to Z" }).click();
  await expect.poll(offered).toEqual(tableOrder);
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(listed).toEqual(tableOrder);
});

test("the sidebar's width: drag its edge, or use the keyboard", async ({ openInTad }) => {
  const { page, controls } = await openInTad(testFile(PARQUET_FILE));
  await controls.openViewSettings();
  const width = async () => Math.round((await sidebar(page).boundingBox())!.width);
  // (once it has finished opening)
  await expect.poll(width).toBe(336);
  const sash = sidebar(page).getByRole("separator", { name: "Sidebar width" });
  const dragBy = async (dx: number, then?: () => Promise<void>) => {
    const b = (await sash.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + 200);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + 200, { steps: 5 });
    await then?.();
    await page.mouse.up();
  };

  await dragBy(60);
  await expect.poll(width).toBe(396);
  await expect(sash).toHaveAttribute("aria-valuenow", "396");
  // Escape puts a drag back:
  await dragBy(80, () => page.keyboard.press("Escape"));
  await expect.poll(width).toBe(396);
  // No narrower than 280:
  await dragBy(-300);
  await expect.poll(width).toBe(280);

  // The Data sources panel has the same width:
  await page.getByRole("button", { name: "Data sources" }).click();
  const panel = page.getByRole("complementary", { name: "Data sources" });
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(280);
  await controls.openViewSettings();

  // The keyboard: the arrow keys, Home and End; a double-click for the default:
  await sash.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(width).toBe(296);
  await page.keyboard.press("End");
  await expect.poll(width).toBeGreaterThan(500);
  await sash.dblclick();
  await expect.poll(width).toBe(336);
});

test("the loading overlay leaves the sidebar usable", async ({ openInTad }) => {
  const { page, controls } = await openInTad(testFile(PARQUET_FILE));
  await controls.openViewSettings();
  // The overlay shows only while a query takes over half a second; add it as
  // the app does, and check it covers the grid but not the sidebar:
  const covers = await page.evaluate(() => {
    const pane = document.querySelector(".center-app-pane") as HTMLElement;
    const overlay = document.createElement("div");
    overlay.className = "tad-ui tui-loading";
    pane.prepend(overlay);
    const o = overlay.getBoundingClientRect();
    const p = pane.getBoundingClientRect();
    overlay.remove();
    return [o.left - p.left, o.top - p.top, o.width - p.width, o.height - p.height];
  });
  expect(covers).toEqual([0, 0, 0, 0]);
});

test("the column list stays in line with its header when it scrolls", async ({ openInTad }) => {
  // Enough columns for the list to scroll (with a scroll bar that takes
  // space, where the system shows those):
  await ensureWideTable();
  const { page, controls } = await openInTad(testFile(WIDE_PARQUET_FILE));
  await controls.openViewSettings();
  const list = sidebar(page).locator(".tui-vs-scroll");
  await expect(list.locator(".tui-colrow").first()).toBeVisible();
  const centers = (selector: string) =>
    sidebar(page)
      .locator(selector)
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return Math.round(r.left + r.width / 2);
        })
      );
  const edges = (selector: string, edge: "left" | "right") =>
    sidebar(page)
      .locator(selector)
      .evaluateAll((els, edge) => els.map((el) => Math.round(el.getBoundingClientRect()[edge])), edge);

  // Layout: Show, Pivot and Sort, the All box, and a row's boxes:
  const head = await centers(".tui-mhead .tui-tgc");
  expect(head).toHaveLength(3);
  expect(await centers(".tui-allrow .tui-tg")).toEqual([head[0]]);
  expect(await centers(".tui-vs-scroll .tui-colrow >> nth=0 >> .tui-tg")).toEqual(head);

  // Aggregation: the header over the selects:
  await mode(page, "Aggregation");
  const agg = await edges(".tui-mhead-agg", "left");
  expect((await edges(".tui-vs-scroll .tui-aggwrap", "left")).slice(0, 1)).toEqual(agg);

  // Format: the defaults' examples in line with the columns':
  await mode(page, "Format");
  const def = await edges(".tui-defs .tui-fmtbtn", "right");
  expect((await edges(".tui-vs-scroll .tui-fmtbtn", "right")).slice(0, 1)).toEqual(def.slice(0, 1));
});
