/*
 * Test driver for Tad's Glide-based grid (tadviewer GlideDataGrid).
 *
 * Glide draws cells on a canvas, but it also renders the visible cells as an
 * ARIA grid (a <table> inside the <canvas>), which is where we read cell text.
 * Cell and header positions come from the window.__tadGrid hook that
 * GlideDataGrid exposes when TAD_TEST_HOOKS=1.
 */
import { expect, Locator, Page } from "@playwright/test";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Modifier = "Shift" | "Meta" | "Control" | "Alt";

/** Strip thousands separators, e.g. "99,999" -> "99999". */
export const digits = (s: string) => s.replace(/,/g, "");

export class GlideGrid {
  constructor(readonly page: Page) {}

  /** Wait for the grid to be created and its first row to be loaded. */
  async waitForData(): Promise<void> {
    await this.page.waitForFunction(() => (window as any).__tadGrid != null, null, {
      timeout: 30_000,
    });
    await expect
      .poll(async () => (await this.rowCells(0).allTextContents()).join(""), {
        timeout: 30_000,
      })
      .not.toBe("");
  }

  /** Displayed row count, from the footer ("N Rows" or "N (M Total) Rows"). */
  async rowCount(): Promise<number> {
    const text = (await this.page.locator(".footer-value").first().textContent()) ?? "";
    const m = text.match(/^\s*([\d,]+)/);
    if (!m) {
      throw new Error(`can't parse row count from footer: "${text}"`);
    }
    return Number(digits(m[1]));
  }

  async expectRowCount(n: number): Promise<void> {
    await expect.poll(() => this.rowCount()).toBe(n);
  }

  async columnIds(): Promise<string[]> {
    return this.page.evaluate(() => (window as any).__tadGrid.columnIds);
  }

  async columnIndex(columnId: string): Promise<number> {
    const idx = (await this.columnIds()).indexOf(columnId);
    if (idx < 0) {
      throw new Error(`column ${columnId} not in grid`);
    }
    return idx;
  }

  /** Header titles, in display order (including sort indicators). */
  async headerTitles(): Promise<string[]> {
    return this.page.locator('table[role="grid"] thead th').allTextContents();
  }

  private rowCells(row: number): Locator {
    return this.page.locator(
      `table[role="grid"] tbody tr[aria-rowindex="${row + 2}"] td`
    );
  }

  private cell(col: number, row: number): Locator {
    return this.page.locator(
      `table[role="grid"] tbody tr[aria-rowindex="${row + 2}"] td[aria-colindex="${col + 1}"]`
    );
  }

  /**
   * Text of a cell, as displayed. Only rows near the visible region are in the
   * accessibility table; rows that haven't loaded yet have empty text.
   */
  async cellText(col: number, row: number): Promise<string | null> {
    const cell = this.cell(col, row);
    if ((await cell.count()) === 0) {
      return null;
    }
    return cell.textContent();
  }

  /** Wait until a cell shows the expected text. */
  async expectCellText(col: number, row: number, expected: string): Promise<void> {
    await expect.poll(() => this.cellText(col, row)).toBe(expected);
  }

  /** Cell bounds in CSS pixels; row -1 is the header. */
  async bounds(col: number, row: number): Promise<Rect> {
    const b = await this.page.evaluate(
      ([c, r]) => (window as any).__tadGrid.getBounds(c, r),
      [col, row]
    );
    if (!b) {
      throw new Error(`no bounds for cell (${col}, ${row})`);
    }
    return b as Rect;
  }

  private async withModifiers(modifiers: Modifier[], action: () => Promise<void>) {
    for (const m of modifiers) {
      await this.page.keyboard.down(m);
    }
    try {
      await action();
    } finally {
      for (const m of [...modifiers].reverse()) {
        await this.page.keyboard.up(m);
      }
    }
  }

  async clickCell(col: number, row: number, modifiers: Modifier[] = []): Promise<void> {
    const b = await this.bounds(col, row);
    await this.withModifiers(modifiers, () =>
      this.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    );
  }

  async clickHeader(col: number, modifiers: Modifier[] = []): Promise<void> {
    const b = await this.bounds(col, -1);
    await this.withModifiers(modifiers, () =>
      this.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    );
  }

  /** Scroll so that the given row is at the top of the grid. */
  async scrollTo(col: number, row: number): Promise<void> {
    await this.page.evaluate(
      ([c, r]) => (window as any).__tadGrid.scrollTo(c, r),
      [col, row]
    );
  }

  private async drag(from: [number, number], to: [number, number]): Promise<void> {
    const mouse = this.page.mouse;
    await mouse.move(from[0], from[1]);
    await mouse.down();
    await mouse.move(to[0], to[1], { steps: 12 });
    await mouse.up();
  }

  /** Drag the right edge of a column header by dx pixels. */
  async resizeColumn(col: number, dx: number): Promise<void> {
    const b = await this.bounds(col, -1);
    const edgeX = b.x + b.width - 1;
    const midY = b.y + b.height / 2;
    await this.drag([edgeX, midY], [edgeX + dx, midY]);
  }

  /** Drag the header of column `from` onto the header of column `to`. */
  async moveColumn(from: number, to: number): Promise<void> {
    const a = await this.bounds(from, -1);
    const b = await this.bounds(to, -1);
    await this.drag(
      [a.x + a.width / 2, a.y + a.height / 2],
      [b.x + b.width / 4, b.y + b.height / 2]
    );
  }

  /**
   * Copy the current selection, returning the text/plain data the grid puts on
   * the clipboard. Dispatches a copy event with its own DataTransfer, so the
   * system clipboard isn't touched.
   */
  async copySelection(): Promise<string> {
    return this.page.evaluate(() => {
      const clipboardData = new DataTransfer();
      window.dispatchEvent(
        new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true })
      );
      return clipboardData.getData("text/plain");
    });
  }
}
