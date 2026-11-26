/*
 * Test driver for Tad's DOM grid (tadviewer DomDataGrid, TAD_GRID=dom).
 *
 * The grid is ordinary DOM: rows are [data-row] elements and cells are
 * [data-col] elements inside them, so cell text and positions come straight
 * from the page. Rows and columns are virtualized, so only those near the
 * visible area exist.
 */
import { expect, Locator, Page } from "@playwright/test";
import {
  drag,
  expectRowCount,
  footerRowCount,
  GridDriver,
  Modifier,
  Rect,
  withModifiers,
} from "./grid-driver";

export const ROW_HEIGHT = 28;

export class DomGrid implements GridDriver {
  constructor(readonly page: Page) {}

  get root(): Locator {
    return this.page.locator(".tad-grid");
  }

  async waitForData(): Promise<void> {
    await expect
      .poll(async () => (await this.rowCells(0).allTextContents()).join(""), {
        timeout: 30_000,
      })
      .not.toBe("");
  }

  rowCount(): Promise<number> {
    return footerRowCount(this.page);
  }

  expectRowCount(n: number): Promise<void> {
    return expectRowCount(this, n);
  }

  async columnIds(): Promise<string[]> {
    return this.root
      .locator('[role="columnheader"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.colId!));
  }

  async columnIndex(columnId: string): Promise<number> {
    const idx = (await this.columnIds()).indexOf(columnId);
    if (idx < 0) {
      throw new Error(`column ${columnId} not in grid`);
    }
    return idx;
  }

  async headerTitles(): Promise<string[]> {
    return this.root.locator(".tad-grid-header-title").allTextContents();
  }

  async sortDirection(col: number): Promise<"ascending" | "descending" | null> {
    const v = await this.header(col).getAttribute("aria-sort");
    return v === "ascending" || v === "descending" ? v : null;
  }

  private header(col: number): Locator {
    return this.root.locator(`[role="columnheader"][data-col="${col}"]`);
  }

  private rowCells(row: number): Locator {
    return this.root.locator(`[data-row="${row}"] [role="gridcell"]`);
  }

  cell(col: number, row: number): Locator {
    return this.root.locator(`[data-row="${row}"] [role="gridcell"][data-col="${col}"]`);
  }

  async cellText(col: number, row: number): Promise<string | null> {
    const cell = this.cell(col, row);
    if ((await cell.count()) === 0) {
      return null;
    }
    return cell.textContent();
  }

  async expectCellText(col: number, row: number, expected: string): Promise<void> {
    await expect.poll(() => this.cellText(col, row)).toBe(expected);
  }

  async bounds(col: number, row: number): Promise<Rect> {
    const loc = row < 0 ? this.header(col) : this.cell(col, row);
    const b = await loc.boundingBox();
    if (!b) {
      throw new Error(`no bounds for cell (${col}, ${row})`);
    }
    return b;
  }

  async clickCell(col: number, row: number, modifiers: Modifier[] = []) {
    const b = await this.bounds(col, row);
    await withModifiers(this.page, modifiers, () =>
      this.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    );
  }

  async clickHeader(col: number, modifiers: Modifier[] = []) {
    const b = await this.bounds(col, -1);
    await withModifiers(this.page, modifiers, () =>
      this.page.mouse.click(b.x + b.width / 3, b.y + b.height / 2)
    );
  }

  /**
   * Scroll as the scrollbar would: set scrollTop, mapping the row's offset
   * into the (possibly scaled) physical scroll range.
   */
  async scrollTo(_col: number, row: number): Promise<void> {
    await this.root.evaluate(
      (root, [row, rowHeight]) => {
        const scroller = root.querySelector(".tad-grid-scroller") as HTMLElement;
        const header = root.querySelector(".tad-grid-header") as HTMLElement;
        const rowCount = Number(root.getAttribute("aria-rowcount")) - 1;
        const viewport = scroller.clientHeight - header.offsetHeight;
        const vMax = Math.max(0, rowCount * rowHeight - viewport);
        const pMax = scroller.scrollHeight - scroller.clientHeight;
        const ratio = pMax > 0 && vMax > pMax ? vMax / pMax : 1;
        scroller.scrollTop = Math.min(row * rowHeight, vMax) / ratio;
      },
      [row, ROW_HEIGHT]
    );
  }

  async resizeColumn(col: number, dx: number): Promise<void> {
    const b = await this.bounds(col, -1);
    const edgeX = b.x + b.width - 1;
    const midY = b.y + b.height / 2;
    await drag(this.page, [edgeX, midY], [edgeX + dx, midY]);
  }

  async moveColumn(from: number, to: number): Promise<void> {
    const a = await this.bounds(from, -1);
    const b = await this.bounds(to, -1);
    await drag(
      this.page,
      [a.x + a.width / 2, a.y + a.height / 2],
      [b.x + b.width / 4, b.y + b.height / 2]
    );
  }

  /**
   * Dispatches a copy event (as Cmd-C or Edit > Copy would) with its own
   * DataTransfer, so the system clipboard isn't touched. The grid separates
   * rows with CRLF (as the SlickGrid grid did); this returns LF.
   */
  async copySelection(): Promise<string> {
    const text = await this.page.evaluate(() => {
      const clipboardData = new DataTransfer();
      document.dispatchEvent(
        new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true })
      );
      return clipboardData.getData("text/plain");
    });
    return text.replace(/\r\n/g, "\n");
  }

  /** A row's top relative to the top of the grid body, if it's rendered. */
  async rowOffset(row: number): Promise<number | null> {
    return this.root.evaluate((root, row) => {
      const body = root.querySelector(".tad-grid-body")!.getBoundingClientRect();
      const el = root.querySelector(`[data-row="${row}"]`);
      return el ? el.getBoundingClientRect().top - body.top : null;
    }, row);
  }

  /** Text of the rendered cells and headers that don't fit their width. */
  async clippedText(): Promise<string[]> {
    return this.root.evaluate((root) =>
      Array.from(
        root.querySelectorAll<HTMLElement>('[role="gridcell"], .tad-grid-header-title')
      )
        .filter((el) => el.scrollWidth > el.clientWidth)
        .map((el) => `${el.textContent} (${el.clientWidth}px < ${el.scrollWidth}px)`)
    );
  }

  /** Index of the first fully visible row. */
  async firstVisibleRow(): Promise<number> {
    return this.root.evaluate((root) => {
      const body = root.querySelector(".tad-grid-body")!.getBoundingClientRect();
      const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-row]"));
      const visible = rows
        .filter((r) => r.getBoundingClientRect().top >= body.top - 0.5)
        .map((r) => Number(r.dataset.row));
      return Math.min(...visible);
    });
  }

  /** The focused cell (with the selection ring), if any. */
  async focusedCell(): Promise<{ row: number; col: number } | null> {
    return this.root.evaluate((root) => {
      const cell = root.querySelector<HTMLElement>(".tad-grid-focus");
      const row = cell?.closest<HTMLElement>("[data-row]");
      return cell && row
        ? { row: Number(row.dataset.row), col: Number(cell.dataset.col) }
        : null;
    });
  }
}
