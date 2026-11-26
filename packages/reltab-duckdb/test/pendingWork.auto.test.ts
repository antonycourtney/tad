/*
 * Finishing DuckDB work before exiting (see src/pendingWork.ts). In its own
 * test file, as once finished, the module refuses new work.
 */
import * as reltab from "reltab";
import { DbDataSource } from "reltab";
import * as reltabDuckDB from "../src/reltab-duckdb";

test("finishPendingWork interrupts running queries and refuses new ones", async () => {
  const dsConn = (await reltab.getConnection({
    providerName: "duckdb",
    resourceId: ":memory:",
  })) as DbDataSource;
  const driver = dsConn.db as reltabDuckDB.DuckDBDriver;

  // A query that would run for a very long time:
  const slow = driver.runSqlQuery("SELECT count(*) FROM range(1000000000000)");
  slow.catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(reltabDuckDB.pendingWorkCount()).toBeGreaterThan(0);

  const start = Date.now();
  expect(await reltabDuckDB.finishPendingWork(5000)).toBe(true);
  expect(Date.now() - start).toBeLessThan(4000);
  expect(reltabDuckDB.pendingWorkCount()).toBe(0);
  await expect(slow).rejects.toThrow();

  await expect(driver.runSqlQuery("SELECT 1")).rejects.toThrow("shutting down");
});
