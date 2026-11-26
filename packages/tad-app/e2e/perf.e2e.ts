/*
 * Scrolling performance, for comparing grid implementations. Not part of the
 * normal test run: set PERF=1, and TAD_GRID to the grid to measure, e.g.
 *
 *   PERF=1 TAD_GRID=dom npx playwright test perf
 *   PERF=1 TAD_GRID=slickgrid npx playwright test perf
 *
 * Each scenario moves the scroll position once per animation frame and
 * records the time between frames: at 60 Hz, intervals over ~17ms are
 * dropped frames. Results are printed as JSON.
 */
import { expect, GRID_IMPL, test } from "./fixtures";
import { ensureWideTable, WIDE_ROWS } from "./test-data";
import { footerRowCount } from "./grid-driver";

test.skip(!process.env.PERF, "set PERF=1 to measure scrolling performance");
test.setTimeout(180_000);

const SCROLLERS: { [impl: string]: string } = {
  dom: ".tad-grid-scroller",
  slickgrid: ".slick-viewport",
  glide: ".dvn-scroller",
};

type Mode = "down-2-rows" | "down-20-rows" | "jump" | "right-120px";

test("scrolling a 60 column table", async ({ openInTad }) => {
  const file = await ensureWideTable();
  const { page } = await openInTad(file, {
    waitForData: false,
    windowSize: { width: 1600, height: 1000 },
  });
  await expect.poll(() => footerRowCount(page), { timeout: 30_000 }).toBe(WIDE_ROWS);
  const selector = SCROLLERS[GRID_IMPL];
  await page.waitForSelector(selector);
  await page.waitForTimeout(1500); // let the first page of rows load

  // Where the time goes (Chrome's cumulative durations, in seconds):
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const m: { [name: string]: number } = {};
    for (const { name, value } of metrics) {
      m[name] = value;
    }
    return m;
  };
  const breakdown = (a: { [n: string]: number }, b: { [n: string]: number }) => {
    const ms = (name: string) => Math.round((b[name] - a[name]) * 1000);
    return {
      scriptMs: ms("ScriptDuration"),
      styleMs: ms("RecalcStyleDuration"),
      layoutMs: ms("LayoutDuration"),
      taskMs: ms("TaskDuration"),
    };
  };

  const results: { [mode: string]: object } = {};
  for (const mode of ["down-2-rows", "down-20-rows", "jump", "right-120px"] as Mode[]) {
    const before = await metrics();
    const timing: object = await page.evaluate(
      async ({ selector, mode, steps }) => {
        const el = document.querySelector(selector) as HTMLElement;
        el.scrollTop = 0;
        el.scrollLeft = 0;
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        await frame();
        await frame();
        const maxTop = el.scrollHeight - el.clientHeight;
        const intervals: number[] = [];
        let last = performance.now();
        for (let i = 0; i < steps; i++) {
          switch (mode) {
            case "down-2-rows":
              el.scrollTop += 56;
              break;
            case "down-20-rows":
              el.scrollTop += 560;
              break;
            case "jump": // like dragging the scrollbar
              el.scrollTop = ((i * 7919) % 1000) / 1000 * maxTop;
              break;
            case "right-120px":
              el.scrollLeft += 120;
              break;
          }
          await frame();
          const now = performance.now();
          intervals.push(now - last);
          last = now;
        }
        const sorted = [...intervals].sort((a, b) => a - b);
        const r1 = (x: number) => Math.round(x * 10) / 10;
        return {
          frames: steps,
          meanMs: r1(intervals.reduce((a, b) => a + b, 0) / steps),
          p95Ms: r1(sorted[Math.floor(steps * 0.95)]),
          maxMs: r1(sorted[steps - 1]),
          over17ms: intervals.filter((x) => x > 17).length,
        };
      },
      { selector, mode, steps: mode === "right-120px" ? 40 : 120 }
    );
    results[mode] = { ...timing, ...breakdown(before, await metrics()) };
  }
  const cells = await page.evaluate(
    () => document.querySelectorAll('[role="gridcell"], .slick-cell').length
  );
  console.log(JSON.stringify({ grid: GRID_IMPL, renderedCells: cells, ...results }));
});
