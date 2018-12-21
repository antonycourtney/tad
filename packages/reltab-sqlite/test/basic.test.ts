import * as sqlite3 from "sqlite3";
import * as reltab from "reltab";
import * as reltabSqlite from "../src/reltab-sqlite";
import * as tp from "typed-promisify";
import { textSpanContainsPosition } from "typescript";
import { delimiter } from "path";

let testCtx : reltabSqlite.SqliteContext;

test("t0 - trivial query generation", () => {
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

const importCsv = async (db, path) => {
  const md = await reltabSqlite.fastImport(db, path);

  const ti = reltabSqlite.mkTableInfo(md);
  testCtx.registerTable(ti);
}

beforeAll(async (): Promise<reltabSqlite.SqliteContext> => {
  const ctx = await reltabSqlite.getContext(":memory:");

  testCtx = (ctx as reltabSqlite.SqliteContext);

  const db = testCtx.db;

  await importCsv(db, 'test/support/sample.csv');
  await importCsv(db, 'test/support/barttest.csv');

  return testCtx;
})

test("t1 - basic sqlite tableQuery", async () => {
  const q1 = reltab.tableQuery('sample');

  const qres = await testCtx.evalQuery(q1);
  expect(qres).toMatchSnapshot();
});

