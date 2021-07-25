import * as sqlite3 from "sqlite3";
import * as reltab from "reltab";
import * as aggtree from "../src/aggtree";
import { PathTree } from "../src/PathTree";
import * as reltabSqlite from "reltab-sqlite";
import { textSpanContainsPosition, textSpanContainsTextSpan } from "typescript";
import { delimiter } from "path";
import * as log from "loglevel";
import * as util from "./testUtils";
import { executionAsyncId } from "async_hooks";
import { DbConnectionKey, getConnection } from "reltab";

log.setLevel("info");

let testCtx: reltabSqlite.SqliteContext;

const importCsv = async (db: sqlite3.Database, path: string) => {
  const md = await reltabSqlite.fastImport(db, path);
};

const pcols = ["JobFamily", "Title", "Union", "Name", "Base", "TCOE"];
const q0 = reltab.tableQuery("barttest").project(pcols);

let tree0: aggtree.VPivotTree;

beforeAll(
  async (): Promise<reltabSqlite.SqliteContext> => {
    log.setLevel("info"); // use "debug" for even more verbosity
    const showQueries = true;
    const connKey: DbConnectionKey = {
      providerName: "sqlite",
      connectionInfo: ":memory:",
    };
    const ctx = await getConnection(connKey);
  
    testCtx = ctx as reltabSqlite.SqliteContext;

    const db = testCtx.db;

    await importCsv(db, "../reltab-sqlite/test/support/sample.csv");
    await importCsv(db, "../reltab-sqlite/test/support/barttest.csv");

    const schema = await aggtree.getBaseSchema(testCtx, q0);
    log.debug("got schema: ", schema);

    tree0 = aggtree.vpivot(
      testCtx,
      q0,
      schema,
      ["JobFamily", "Title"],
      "Name",
      true,
      []
    );

    return testCtx;
  }
);

test("rootQuery Test", async () => {
  const rq0 = tree0.rootQuery;
  log.info("root query exp:\n", rq0?.toJS());

  const res0 = await testCtx.evalQuery(rq0!);
  log.info("root query result:");
  util.logTable(res0);
  expect(res0).toMatchSnapshot();
});

test("initial applyPath operations", async () => {
  const q1 = tree0.applyPath([]);
  log.info("open root query:");
  log.info(q1.toJS());
  const res1 = await testCtx.evalQuery(q1);
  util.logTable(res1);

  const expCols = [
    "JobFamily",
    "Title",
    "Union",
    "Name",
    "Base",
    "TCOE",
    "Rec",
    "_depth",
    "_pivot",
    "_isRoot",
    "_sortVal_0",
    "_sortVal_1",
    "_sortVal_2",
    "_path0",
    "_path1",
  ];

  expect(res1.schema.columns).toEqual(expCols);
  expect(res1.rowData.length).toBe(9);

  const actSum = util.columnSum(res1, "TCOE");

  expect(actSum).toBe(4691559);
});

test("open specific node", async () => {
  const q2 = tree0.applyPath(["Executive Management"]);

  // console.log("after opening node: q2: ", JSON.stringify(q2, null, 2));

  const res2 = await testCtx.evalQuery(q2);

  // console.log('after applying path ["Executive Management"]:');
  // util.logTable(res2);
  expect(res2).toMatchSnapshot();

  const q3 = tree0.applyPath(["Executive Management", "General Manager"]);
  const res3 = await testCtx.evalQuery(q3);

  // console.log("after applying path /Executive Management/General Manager:");
  // util.logTable(res3);
  expect(res3).toMatchSnapshot();

  const openPaths = new PathTree({ '"Executive Management"': {} });
  const q4 = tree0.getTreeQuery(openPaths);
  const res4 = await testCtx.evalQuery(q4);

  // console.log("after treeQuery for path /Executive Management: ");
  util.logTable(res4);
});

// Based on aggTreeTest1 from original Tad test suite:
test("basic sorted aggTree test", async () => {
  const q0 = reltab.tableQuery("barttest").project(pcols);
  const schema = await aggtree.getBaseSchema(testCtx, q0);
  const tree0 = aggtree.vpivot(
    testCtx,
    q0,
    schema,
    ["JobFamily", "Title"],
    "Name",
    true,
    [
      ["TCOE", false],
      ["Base", true],
      ["Title", true],
    ]
  );

  // console.log("vpivot initial promise resolved...");

  const sq1 = tree0.getSortQuery(1);

  const res = await testCtx.evalQuery(sq1);
  // console.log("sort query depth 1: ");
  // util.logTable(res);

  expect(res).toMatchSnapshot();

  const sq2 = tree0.getSortQuery(2);

  const res2 = await testCtx.evalQuery(sq2);
  // console.log("sort query depth 2: ");
  // util.logTable(res2);
  expect(res2).toMatchSnapshot();

  const q1 = tree0.applyPath([]);

  // console.log("got depth 1 query and sortQuery, joining...: ");
  const jq1 = q1.join(sq1, "_path0");
  const jres = await testCtx.evalQuery(jq1);

  // console.log("result of join query: ");
  // util.logTable(jres);
  expect(jres).toMatchSnapshot();
});

test("async aggTree sortedTreeQuery test", async () => {
  const q0 = reltab.tableQuery("barttest").project(pcols);
  const schema = await aggtree.getBaseSchema(testCtx, q0);
  const tree0 = aggtree.vpivot(
    testCtx,
    q0,
    schema,
    ["JobFamily", "Title"],
    "Name",
    true,
    [
      ["TCOE", false],
      ["Base", true],
      ["Title", true],
    ]
  );
  const rtc = testCtx;
  const openPaths = new PathTree({
    '"Executive Management"': { '"General Manager"': {} },
    '"Safety"': {},
  });
  const q4 = tree0.getTreeQuery(openPaths);
  const res4 = await rtc.evalQuery(q4);

  // console.log("tree query after opening paths:");
  // util.logTable(res4, { maxRows: 50 });

  const sq1 = tree0.getSortQuery(1);

  const res = await testCtx.evalQuery(sq1);
  // console.log("sort query depth 1: ");
  // util.logTable(res);

  expect(res).toMatchSnapshot();
  const sq2 = tree0.getSortQuery(2);

  const res2 = await testCtx.evalQuery(sq2);
  // console.log("sort query depth 2: ");
  // util.logTable(res2);
  expect(res2).toMatchSnapshot();

  const jq4 = q4.join(sq1, ["_path0"]).join(sq2, ["_path0", "_path1"]);
  const jres4 = await rtc.evalQuery(jq4);

  // console.log("tree query after sort joins:");
  // util.logTable(jres4, { maxRows: 50 });
  expect(jres4).toMatchSnapshot();

  const stq = tree0.getSortedTreeQuery(openPaths);

  console.log("full sorted tree query:\n", stq.toJS());

  const sres = await rtc.evalQuery(stq);

  // console.log("result of sorted tree query:");
  // util.logTable(sres, { maxRows: 50 });
  expect(sres).toMatchSnapshot();
});
