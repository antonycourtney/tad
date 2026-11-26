/*
 * Playwright fixture that launches the Tad desktop app (packages/tad-app/dist,
 * so run `npm run build-prod` first) on a file. The grid implementation comes
 * from TAD_GRID ("dom" by default; "glide" also has a test driver).
 */
import {
  _electron as electron,
  ElectronApplication,
  expect,
  Page,
  test as base,
} from "@playwright/test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DomGrid } from "./dom-grid";
import { GlideGrid } from "./glide-grid";
import { GridDriver } from "./grid-driver";

export const GRID_IMPL = process.env.TAD_GRID ?? "dom";

const gridDriver = (page: Page): GridDriver =>
  GRID_IMPL === "glide" ? new GlideGrid(page) : new DomGrid(page);

const APP_DIR = path.resolve(__dirname, "..");

export interface TadWindow {
  app: ElectronApplication;
  page: Page;
  grid: GridDriver;
}

export interface OpenOptions {
  /** Wait for the first rows to load (default true). */
  waitForData?: boolean;
  /** Window size (CSS pixels), if not the default. */
  windowSize?: { width: number; height: number };
}

/**
 * The window showing Tad's UI. (Not app.firstWindow(): Tad briefly creates
 * and closes a blank window first.)
 */
async function tadWindow(app: ElectronApplication, timeoutMs = 30_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = app
      .windows()
      .find((p) => !p.isClosed() && p.url().endsWith("/index.html"));
    if (page) {
      return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timed out waiting for the Tad window");
}

interface TadFixtures {
  /** Launch Tad on a file, and wait for the grid's first rows. */
  openInTad: (file: string, options?: OpenOptions) => Promise<TadWindow>;
}

export const test = base.extend<TadFixtures>({
  openInTad: async ({}, use, testInfo) => {
    const launched: { app: ElectronApplication; page?: Page; userDataDir: string }[] =
      [];
    await use(async (file: string, options: OpenOptions = {}) => {
      // A fresh user data directory per launch, so tests don't share state
      // with each other or with an installed copy of Tad:
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tad-e2e-user-"));
      const app = await electron.launch({
        cwd: APP_DIR,
        // Same arguments as `npm start -- -f <file>`:
        args: [".", "-f", file],
        env: {
          ...process.env,
          TAD_GRID: GRID_IMPL,
          TAD_TEST_HOOKS: "1",
          TAD_USER_DATA_DIR: userDataDir,
        },
      });
      const entry: (typeof launched)[number] = { app, userDataDir };
      launched.push(entry);
      const page = await tadWindow(app);
      entry.page = page;
      if (options.windowSize) {
        const { width, height } = options.windowSize;
        await app.evaluate(({ BrowserWindow }, [w, h]) => {
          for (const win of BrowserWindow.getAllWindows()) {
            win.setContentSize(w, h);
          }
        }, [width, height]);
      }
      const grid = gridDriver(page);
      if (options.waitForData ?? true) {
        await grid.waitForData();
      }
      return { app, page, grid };
    });
    for (const [i, { app, page, userDataDir }] of launched.entries()) {
      if (page && testInfo.status !== testInfo.expectedStatus) {
        try {
          const screenshotPath = testInfo.outputPath(`screenshot-${i}.png`);
          await page.screenshot({ path: screenshotPath });
          await testInfo.attach("screenshot", {
            path: screenshotPath,
            contentType: "image/png",
          });
        } catch (e) {}
      }
      await app.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },
});

export { expect };
