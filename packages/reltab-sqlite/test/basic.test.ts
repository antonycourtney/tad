import * as sqlite3 from "sqlite3";
import * as reltab from "reltab";
import * as reltabSqlite from "../src/reltab-sqlite";
import * as tp from "typed-promisify";
import { textSpanContainsPosition } from "typescript";
import { delimiter } from "path";
import * as log from 'loglevel';
import * as util from './testUtils';

const { col, constVal } = reltab;

log.setLevel('debug');

let testCtx: reltabSqlite.SqliteContext;

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

const bartTableQuery = reltab.tableQuery('barttest');

test("t2 - basic bart table query", async () => {
  const qres = await testCtx.evalQuery(bartTableQuery);

  expect(qres).toMatchSnapshot();
});

test("basic rowcount", async () => {
  const rowCount = await testCtx.rowCount(bartTableQuery);

  expect(rowCount).toBe(23);
});

test('basic project operator', async () => {
  const pcols = ['JobFamily', 'Title', 'Union', 'Name', 'Base', 'TCOE']
  const q2 = bartTableQuery.project(pcols);

  const qres = await testCtx.evalQuery(q2);
  expect(qres.schema.columns).toEqual(pcols);

  expect(qres).toMatchSnapshot();
});

test('basic groupBy', async () => {
  const q3 = bartTableQuery.groupBy(['JobFamily', 'Title'], ['TCOE'])  // note: [ 'TCOE' ] equivalent to [ [ 'sum', 'TCOE' ] ]

  // testCtx.showQueries = true;
  const qres = await testCtx.evalQuery(q3);

  const expCols = ['JobFamily', 'Title', 'TCOE'];
  expect(qres.schema.columns).toEqual(expCols);

  expect(qres.rowData.length).toBe(19);

  const baseRes = await testCtx.evalQuery(bartTableQuery);
  const tcoeSum = util.columnSum(baseRes, 'TCOE');

  const groupSum = util.columnSum(qres, 'TCOE');
  expect(groupSum).toBe(tcoeSum);

  expect(qres).toMatchSnapshot();
});

test('basic filter', async () => {
  const q5 = bartTableQuery.filter(reltab.and().eq(col('JobFamily'), constVal('Executive Management')));

  const res = await testCtx.evalQuery(q5);
  expect(res.rowData.length).toBe(4);

  expect(res).toMatchSnapshot();
});

