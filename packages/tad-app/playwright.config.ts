import { defineConfig } from "@playwright/test";

// The new UI's results (TAD_UI=new) go in their own directory, so that CI can
// run the tests with each UI and keep both sets of results:
const RESULTS = process.env.TAD_UI === "new" ? "e2e-results-new-ui" : "e2e-results";

/*
 * UI tests for the Tad desktop app; see e2e/ and doc/building.md.
 * Tests launch the built app (dist/), so run `npm run build-prod` first.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: `./${RESULTS}`,
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Each test launches its own app window; run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  // In CI, also write JUnit results (published to Azure Pipelines' Tests tab):
  reporter: process.env.CI
    ? [["list"], ["junit", { outputFile: `${RESULTS}/junit.xml` }]]
    : "list",
});
