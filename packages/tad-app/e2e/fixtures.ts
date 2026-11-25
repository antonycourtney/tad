/*
 * Playwright fixture that launches the Tad desktop app (packages/tad-app/dist,
 * so run `npm run build-prod` first) on a file, using the Glide grid.
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
import { GlideGrid } from "./glide-grid";

const APP_DIR = path.resolve(__dirname, "..");

export interface TadWindow {
  app: ElectronApplication;
  page: Page;
  grid: GlideGrid;
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
  openInTad: (file: string) => Promise<TadWindow>;
}

export const test = base.extend<TadFixtures>({
  openInTad: async ({}, use, testInfo) => {
    const launched: { app: ElectronApplication; page?: Page; userDataDir: string }[] =
      [];
    await use(async (file: string) => {
      // A fresh user data directory per launch, so tests don't share state
      // with each other or with an installed copy of Tad:
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tad-e2e-user-"));
      const app = await electron.launch({
        cwd: APP_DIR,
        // Same arguments as `npm start -- -f <file>`:
        args: [".", "-f", file],
        env: {
          ...process.env,
          TAD_GRID: process.env.TAD_GRID ?? "glide",
          TAD_TEST_HOOKS: "1",
          TAD_USER_DATA_DIR: userDataDir,
        },
      });
      const entry: (typeof launched)[number] = { app, userDataDir };
      launched.push(entry);
      const page = await tadWindow(app);
      entry.page = page;
      const grid = new GlideGrid(page);
      await grid.waitForData();
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
