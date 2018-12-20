import * as sqlite3 from "sqlite3";
import * as reltab from "reltab";
import * as reltabSqlite from "../src/reltab-sqlite";
import * as tp from "typed-promisify";
import { textSpanContainsPosition } from "typescript";
import { delimiter } from "path";

let testCtx : reltabSqlite.SqliteContext;

test("t0", () => {
  const q1 = reltab.tableQuery("barttest");

  expect(q1).toMatchInlineSnapshot(`
QueryExp {
  "expType": "QueryExp",
  "operator": "table",
  "tableArgs": Array [],
  "valArgs": Array [
    "barttest",
  ],
}
`);
});

beforeAll(async (): Promise<reltabSqlite.SqliteContext> => {
  const ctx = await reltabSqlite.getContext(":memory:");

  testCtx = (ctx as reltabSqlite.SqliteContext);

  const db = testCtx.db;

  const md = await reltabSqlite.fastImport(
    db,
    "test/support/sample.csv",
    {}
  );

  const ti = reltabSqlite.mkTableInfo(md);
  testCtx.registerTable(ti);

  return testCtx;
})

test("t1", async () => {
  const q1 = reltab.tableQuery('sample');

  const qres = await testCtx.evalQuery(q1);
  expect(qres).toMatchSnapshot();
});
