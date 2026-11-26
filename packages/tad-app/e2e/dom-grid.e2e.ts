/*
 * Tests specific to the DOM grid (TAD_GRID=dom): keyboard navigation,
 * selection, NULL display, and scrolling a table taller than the browser's
 * maximum element height.
 */
import { DomGrid, ROW_HEIGHT } from "./dom-grid";
import { expect, GRID_IMPL, test } from "./fixtures";
import { digits } from "./grid-driver";
import {
  BIG_ROWS,
  ensureBigTable,
  ensureWideTable,
  N_ROWS,
  PARQUET_FILE,
  PIVOT_TAD_FILE,
  SORTED_TAD_FILE,
  testFile,
} from "./test-data";

test.skip(GRID_IMPL !== "dom", "DOM grid only");

test.describe("keyboard and selection", () => {
  test("arrow keys move the focus, shift extends the selection", async ({
    openInTad,
  }) => {
    const { grid, page } = await openInTad(testFile(SORTED_TAD_FILE));
    const dom = grid as DomGrid;
    await dom.expectCellText(0, 0, "0");

    await dom.clickCell(0, 0);
    expect(await dom.focusedCell()).toEqual({ row: 0, col: 0 });

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    expect(await dom.focusedCell()).toEqual({ row: 2, col: 1 });

    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowRight");
    expect(await dom.copySelection()).toBe("East\tCountry 00\nWest\tCountry 00");
  });

  test("Cmd/Ctrl+Down jumps to the last row", async ({ openInTad }) => {
    const { grid, page } = await openInTad(testFile(SORTED_TAD_FILE));
    const dom = grid as DomGrid;
    await dom.expectCellText(0, 0, "0");

    await dom.clickCell(0, 0);
    await page.keyboard.press("ControlOrMeta+ArrowDown");
    expect(await dom.focusedCell()).toEqual({ row: N_ROWS - 1, col: 0 });
    await expect
      .poll(async () => digits((await dom.cellText(0, N_ROWS - 1)) ?? ""))
      .toBe(String(N_ROWS - 1));
  });
});

test("small wheel steps move the rows smoothly, and back to the top", async ({
  openInTad,
}) => {
  // A mouse wheel scrolls a few pixels at a time. The rows must follow each
  // step (not only when a new row comes into view), and end exactly at the
  // top after scrolling back up (they used to be left a step too high).
  const { grid, page } = await openInTad(testFile(SORTED_TAD_FILE));
  const dom = grid as DomGrid;
  await dom.expectCellText(0, 0, "0");
  const b = await dom.bounds(1, 3);
  await page.mouse.move(b.x + 5, b.y + 5);

  await page.mouse.wheel(0, 4);
  await expect.poll(() => dom.rowOffset(0)).toBe(-4);

  for (let i = 0; i < 100; i++) {
    await page.mouse.wheel(0, 4);
  }
  await expect.poll(() => dom.rowOffset(20)).toBe(20 * ROW_HEIGHT - 404);
  for (let i = 0; i < 110; i++) {
    await page.mouse.wheel(0, -4);
  }
  await expect.poll(() => dom.rowOffset(0)).toBe(0);
});

test("shows NULL in leaf rows", async ({ openInTad }) => {
  const { grid } = await openInTad(testFile(PARQUET_FILE));
  const dom = grid as DomGrid;
  const urlCol = await dom.columnIndex("order_url");
  // order_url is set for every fourth order:
  await dom.expectCellText(urlCol, 0, "https://example.com/orders/0");
  await dom.expectCellText(urlCol, 1, "NULL");
  await expect(dom.cell(urlCol, 1)).toHaveClass(/tad-grid-null/);
});

test.describe("10 million rows", () => {
  test.setTimeout(180_000);

  test("scrolls to the end, and the wheel moves 1:1", async ({ openInTad }) => {
    const file = await ensureBigTable();
    const { grid, page } = await openInTad(file);
    const dom = grid as DomGrid;
    await dom.expectRowCount(BIG_ROWS);

    // The scroll area is capped, not 280M pixels tall:
    const scrollHeight = await dom.root
      .locator(".tad-grid-scroller")
      .evaluate((el) => el.scrollHeight);
    expect(scrollHeight).toBeLessThan(11_000_000);

    // Scrollbar to the middle and to the end:
    const idCol = await dom.columnIndex("id");
    for (const target of [BIG_ROWS / 2, BIG_ROWS - 1]) {
      await dom.scrollTo(0, target);
      await expect
        .poll(async () => digits((await dom.cellText(idCol, target)) ?? ""), {
          timeout: 30_000,
        })
        .toBe(String(target));
    }

    // The wheel moves the rows by the pixels scrolled (not ~28x that, as
    // native scrolling over the scaled scroll area would):
    await dom.scrollTo(0, BIG_ROWS / 2);
    await expect
      .poll(async () => digits((await dom.cellText(idCol, BIG_ROWS / 2)) ?? ""))
      .toBe(String(BIG_ROWS / 2));
    const before = await dom.firstVisibleRow();
    const b = await dom.bounds(idCol, before);
    await page.mouse.move(b.x + 5, b.y + 5);
    await page.mouse.wheel(0, 10 * ROW_HEIGHT);
    await expect.poll(() => dom.firstVisibleRow()).toBe(before + 10);
    await page.mouse.wheel(0, -3 * ROW_HEIGHT);
    await expect.poll(() => dom.firstVisibleRow()).toBe(before + 7);
  });
});

test.describe("fonts and column widths", () => {
  test("uses the bundled Inter font, with tabular digits", async ({ openInTad }) => {
    const { grid } = await openInTad(testFile(SORTED_TAD_FILE));
    const dom = grid as DomGrid;
    await dom.expectCellText(0, 0, "0");
    await expect.poll(() => dom.root.evaluate(() => document.fonts.check("12px TadInter"))).toBe(true);
    const widths = await dom.root.evaluate((root) => {
      const cell = root.querySelector('[role="gridcell"]') as HTMLElement;
      const width = (text: string) => {
        const s = document.createElement("span");
        s.textContent = text;
        cell.appendChild(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w;
      };
      return [width("1111111111"), width("0000000000")];
    });
    expect(widths[0]).toBe(widths[1]);
  });

  test("columns are wide enough for their headers and cells", async ({ openInTad }) => {
    const { grid, page } = await openInTad(testFile(SORTED_TAD_FILE));
    const dom = grid as DomGrid;
    await dom.expectCellText(0, 0, "0");
    await page.waitForTimeout(300); // (widths are measured again once fonts load)
    expect(await dom.clippedText()).toEqual([]);
  });

  test("pivot columns are wide enough, including after expanding", async ({
    openInTad,
  }) => {
    const { grid, page } = await openInTad(testFile(PIVOT_TAD_FILE));
    const dom = grid as DomGrid;
    await dom.expectRowCount(6);
    await page.waitForTimeout(300);
    expect(await dom.clippedText()).toEqual([]);
    // Expanding shows leaf rows, with values in columns that were blank:
    await dom.clickCell(0, 2);
    await dom.expectRowCount(26);
    await dom.clickCell(0, 3);
    await expect.poll(() => dom.rowCount()).toBeGreaterThan(26);
    await expect.poll(() => dom.clippedText()).toEqual([]);
  });
});

test.describe("drag-selecting past an edge scrolls", () => {
  test("down, below the grid", async ({ openInTad }) => {
    const { grid, page } = await openInTad(testFile(SORTED_TAD_FILE));
    const dom = grid as DomGrid;
    await dom.expectCellText(0, 0, "0");
    const start = await dom.bounds(1, 2);
    const body = (await dom.root.locator(".tad-grid-body").boundingBox())!;
    const visibleRows = Math.floor(body.height / ROW_HEIGHT);
    await page.mouse.move(start.x + 5, start.y + 5);
    await page.mouse.down();
    await page.mouse.move(start.x + 5, body.y + body.height + 40, { steps: 5 });
    await expect.poll(() => dom.firstVisibleRow()).toBeGreaterThan(20);
    await page.mouse.up();
    const focus = (await dom.focusedCell())!;
    expect(focus.col).toBe(1);
    expect(focus.row).toBeGreaterThan(visibleRows + 20);
    // The selection runs from the start of the drag to the focused cell:
    const copied = await dom.copySelection();
    expect(copied.split("\n").length).toBe(focus.row - 2 + 1);
  });

  test("right, past the last visible column", async ({ openInTad }) => {
    const { grid, page } = await openInTad(await ensureWideTable());
    const dom = grid as DomGrid;
    await dom.expectCellText(0, 0, "0");
    const start = await dom.bounds(1, 1);
    const scroller = dom.root.locator(".tad-grid-scroller");
    const box = (await scroller.boundingBox())!;
    await page.mouse.move(start.x + 5, start.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 40, start.y + 5, { steps: 5 });
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(500);
    await page.mouse.up();
    const focus = (await dom.focusedCell())!;
    expect(focus.row).toBe(1);
    expect(focus.col).toBeGreaterThan(8);
  });
});
