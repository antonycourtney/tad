import * as sqlite3 from "sqlite3";
import * as reltab from "reltab";
import * as aggtree from "../src/aggtree";
import * as reltabSqlite from "reltab-sqlite";
import { textSpanContainsPosition, textSpanContainsTextSpan } from "typescript";
import { delimiter } from "path";
import * as log from "loglevel";
import * as util from "./testUtils";

log.setLevel("debug");

let testCtx: reltabSqlite.SqliteContext;

const importCsv = async (db: sqlite3.Database, path: string) => {
  const md = await reltabSqlite.fastImport(db, path);

  const ti = reltabSqlite.mkTableInfo(md);
  testCtx.registerTable(ti);
};

beforeAll(
  async (): Promise<reltabSqlite.SqliteContext> => {
    const ctx = await reltabSqlite.getContext(":memory:");

    testCtx = ctx as reltabSqlite.SqliteContext;

    const db = testCtx.db;

    await importCsv(db, "../reltab-sqlite/test/support/sample.csv");
    await importCsv(db, "../reltab-sqlite/test/support/barttest.csv");

    return testCtx;
  }
);

const pcols = ["JobFamily", "Title", "Union", "Name", "Base", "TCOE"];

test("initial aggtree Test", async () => {
  const q0 = reltab.tableQuery("barttest").project(pcols);

  const schema = await aggtree.getBaseSchema(testCtx, q0);
  log.debug("got schema: ", schema);

  const tree0 = aggtree.vpivot(
    testCtx,
    q0,
    schema,
    ["JobFamily", "Title"],
    "Name",
    true,
    []
  );
  log.debug("vpivot initial promise resolved...");
  const rq0 = tree0.rootQuery;
  log.debug("root query exp: ", rq0);

  const res0 = await testCtx.evalQuery(rq0!);
  log.debug("root query result:", res0);
  util.logTable(res0);

  const q1 = tree0.applyPath([]);
  const res1 = await testCtx.evalQuery(q1);
  log.debug("open root query:");
  util.logTable(res1);
});
