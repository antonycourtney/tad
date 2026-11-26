/*
 * What the UI tests need from a grid implementation. Each of Tad's grids
 * (selected with TAD_GRID) has a driver: DomGrid (dom-grid.ts) and
 * GlideGrid (glide-grid.ts).
 */
import { expect, Page } from "@playwright/test";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Modifier = "Shift" | "Meta" | "Control" | "Alt";

/** Strip thousands separators, e.g. "99,999" -> "99999". */
export const digits = (s: string) => s.replace(/,/g, "");

export interface GridDriver {
  readonly page: Page;
  /** Wait for the grid to be created and its first row to be loaded. */
  waitForData(): Promise<void>;
  rowCount(): Promise<number>;
  expectRowCount(n: number): Promise<void>;
  columnIds(): Promise<string[]>;
  columnIndex(columnId: string): Promise<number>;
  /** Header titles, in display order (without sort indicators). */
  headerTitles(): Promise<string[]>;
  sortDirection(col: number): Promise<"ascending" | "descending" | null>;
  /** Displayed text of a cell, or null if the row isn't rendered. */
  cellText(col: number, row: number): Promise<string | null>;
  expectCellText(col: number, row: number, expected: string): Promise<void>;
  /** Cell bounds in CSS pixels; row -1 is the header. */
  bounds(col: number, row: number): Promise<Rect>;
  clickCell(col: number, row: number, modifiers?: Modifier[]): Promise<void>;
  clickHeader(col: number, modifiers?: Modifier[]): Promise<void>;
  /** Scroll so that the given row is in view. */
  scrollTo(col: number, row: number): Promise<void>;
  resizeColumn(col: number, dx: number): Promise<void>;
  moveColumn(from: number, to: number): Promise<void>;
  /** Copy the selection, returning the text the grid puts on the clipboard. */
  copySelection(): Promise<string>;
}

/** Row count, from the footer ("N Rows" or "N (M Total) Rows"). */
export async function footerRowCount(page: Page): Promise<number> {
  const text = (await page.locator(".footer-value").first().textContent()) ?? "";
  const m = text.match(/^\s*([\d,]+)/);
  if (!m) {
    throw new Error(`can't parse row count from footer: "${text}"`);
  }
  return Number(digits(m[1]));
}

export async function withModifiers(
  page: Page,
  modifiers: Modifier[],
  action: () => Promise<void>
): Promise<void> {
  for (const m of modifiers) {
    await page.keyboard.down(m);
  }
  try {
    await action();
  } finally {
    for (const m of [...modifiers].reverse()) {
      await page.keyboard.up(m);
    }
  }
}

export async function drag(
  page: Page,
  from: [number, number],
  to: [number, number]
): Promise<void> {
  const mouse = page.mouse;
  await mouse.move(from[0], from[1]);
  await mouse.down();
  await mouse.move(to[0], to[1], { steps: 12 });
  await mouse.up();
}

export async function expectRowCount(grid: GridDriver, n: number) {
  await expect.poll(() => grid.rowCount()).toBe(n);
}
