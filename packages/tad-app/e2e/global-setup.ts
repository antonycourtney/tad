import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { generateTestData } from "./test-data";

/** Generate the test data once per run, into a temporary directory. */
export default async function globalSetup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tad-e2e-data-"));
  await generateTestData(dir);
  process.env.TAD_E2E_DATA_DIR = dir;
  return async () => {
    fs.rmSync(dir, { recursive: true, force: true });
  };
}
