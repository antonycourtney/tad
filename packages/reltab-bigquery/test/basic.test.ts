import * as reltab from "reltab";
import { BigQueryConnection } from "../src/reltab-bigquery";
import * as util from "./testUtils";
import * as log from "loglevel";
import * as aggtree from "aggtree";
import { PathTree } from "aggtree";

const PROJECT_ID = "";

let testCtx: BigQueryConnection;

const btSchema = {
  fields: [
    { name: "Name", type: "string" },
    { name: "Title", type: "string" },
    { name: "Base", type: "integer" },
    { name: "TCOE", type: "integer" },
    { name: "JobFamily", type: "string" },
    { name: "Union", type: "string" },
  ],
};

beforeAll(async () => {
  log.setLevel(log.levels.DEBUG);

  testCtx = new BigQueryConnection(
    "bigquery-test-project-276102",
    "test_dataset",
    {
      showQueries: true,
    }
  );
  const metadata = {
    schema: btSchema,
    skipLeadingRows: 1,
    writeDisposition: "WRITE_TRUNCATE",
  };
  await testCtx.importCsv(
    "../reltab-sqlite/test/support/barttest.csv",
    metadata
  );
  console.log("done importing barttest");

  const ti = await testCtx.getTableInfo(
    "bigquery-test-project-276102.test_dataset.barttest"
  );
  console.log("barttest tableInfo: ", JSON.stringify(ti, undefined, 2));
});

test("public covid19 dataset - basic covid-table query", async () => {
  const rtc = new BigQueryConnection(
    "bigquery-public-data",
    "covid19_jhu_csse",
    { showQueries: true }
  );

  const ti = await rtc.getTableInfo(
    "bigquery-public-data.covid19_jhu_csse.summary"
  );
  console.log("tableInfo: ", JSON.stringify(ti, undefined, 2));

  console.log("basic table query:");
  const q1 = reltab.tableQuery("bigquery-public-data.covid19_jhu_csse.summary");
  const q1res = await rtc.evalQuery(q1, 0, 100);
  console.log("q1 query result: row 0: ", q1res.rowData[0], "...");
  util.logTable(q1res, { maxRows: 20 });
});

const bartTableQuery = reltab.tableQuery(
  "bigquery-test-project-276102.test_dataset.barttest"
);

test("t2 - basic bart table query", async () => {
  const qres = await testCtx.evalQuery(bartTableQuery);

  expect(qres).toMatchSnapshot();
});

test("basic rowcount", async () => {
  const rowCount = await testCtx.rowCount(bartTableQuery);

  expect(rowCount).toBe(23);
});

const pcols = ["JobFamily", "Title", "Union", "Name", "Base", "TCOE"];
const q2 = bartTableQuery.project(pcols);

test("basic project operator", async () => {
  const qres = await testCtx.evalQuery(q2);
  expect(qres.schema.columns).toEqual(pcols);

  expect(qres).toMatchSnapshot();
});

test("basic groupBy", async () => {
  const q3 = bartTableQuery.groupBy(["JobFamily", "Title"], ["TCOE"]); // note: [ 'TCOE' ] equivalent to [ [ 'sum', 'TCOE' ] ]

  // testCtx.showQueries = true;
  const qres = await testCtx.evalQuery(q3);

  const expCols = ["JobFamily", "Title", "TCOE"];
  expect(qres.schema.columns).toEqual(expCols);

  expect(qres.rowData.length).toBe(19);

  const baseRes = await testCtx.evalQuery(bartTableQuery);
  const tcoeSum = util.columnSum(baseRes, "TCOE");

  const groupSum = util.columnSum(qres, "TCOE");
  expect(groupSum).toBe(tcoeSum);

  util.logTable(qres);

  expect(qres).toMatchSnapshot();
});

test("extended groupBy", async () => {
  // Let's also try mapping the pivot column to be named "_pivot":
  const q3 = bartTableQuery.groupBy(["JobFamily", "Title"], ["TCOE"]); // note: [ 'TCOE' ] equivalent to [ [ 'sum', 'TCOE' ] ]

  const q4 = q3.mapColumns({ JobFamily: { id: "_pivot" } });

  const q4res = await testCtx.evalQuery(q4);

  console.log("groupBy plus mapColumns:");
  util.logTable(q4res);
  expect(q4res).toMatchSnapshot();

  /* This fails -- probably a good clue about what we'll have to fix with aggtree
  const q5 = bartTableQuery.groupBy(
    ["JobFamily", "Title"],
    ["TCOE", ["null", "JobFamily"]]
  ); // note: [ 'TCOE' ] equivalent to [ [ 'sum', 'TCOE' ] ]

  const q5res = await testCtx.evalQuery(q5);

  util.logTable(q5res);

  // expect(q5res).toMatchSnapshot();
  */
});

test("initial aggtree Test", async () => {
  const q0 = bartTableQuery.project(pcols);

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
  const rq0 = tree0.rootQuery;
  log.debug("root query exp: ", rq0);

  const res0 = await testCtx.evalQuery(rq0!);
  log.debug("root query result:", res0);
  util.logTable(res0);

  const q1 = tree0.applyPath([]);
  const res1 = await testCtx.evalQuery(q1);
  log.debug("open root query:");
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

  const q2 = tree0.applyPath(["Executive Management"]);

  console.log("after opening node: q2: ", JSON.stringify(q2, null, 2));

  const res2 = await testCtx.evalQuery(q2);

  console.log('after applying path ["Executive Management"]:');
  util.logTable(res2);
  expect(res2).toMatchSnapshot();

  const q3 = tree0.applyPath(["Executive Management", "General Manager"]);
  const res3 = await testCtx.evalQuery(q3);

  console.log("after applying path /Executive Management/General Manager:");
  util.logTable(res3);
  expect(res3).toMatchSnapshot();

  const openPaths = new PathTree({ '"Executive Management"': {} });
  const q4 = tree0.getTreeQuery(openPaths);
  const res4 = await testCtx.evalQuery(q4);

  console.log("after treeQuery for path /Executive Management: ");
  util.logTable(res4);
});

// Based on aggTreeTest1 from original Tad test suite:
test("basic sorted aggTree test", async () => {
  const q0 = bartTableQuery.project(pcols);
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

  console.log("vpivot initial promise resolved...");

  const sq1 = tree0.getSortQuery(1);

  const res = await testCtx.evalQuery(sq1);
  console.log("sort query depth 1: ");
  util.logTable(res);

  expect(res).toMatchSnapshot();

  const sq2 = tree0.getSortQuery(2);

  const res2 = await testCtx.evalQuery(sq2);
  console.log("sort query depth 2: ");
  util.logTable(res2);
  expect(res2).toMatchSnapshot();

  const q1 = tree0.applyPath([]);

  console.log("got depth 1 query and sortQuery, joining...: ");
  const jq1 = q1.join(sq1, "_path0");
  const jres = await testCtx.evalQuery(jq1);

  console.log("result of join query: ");
  util.logTable(jres);
  expect(jres).toMatchSnapshot();
});

test("async aggTree sortedTreeQuery test", async () => {
  const q0 = bartTableQuery.project(pcols);
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

  console.log("tree query after opening paths:");
  util.logTable(res4, { maxRows: 50 });

  const sq1 = tree0.getSortQuery(1);

  const res = await testCtx.evalQuery(sq1);
  console.log("sort query depth 1: ");
  util.logTable(res);

  expect(res).toMatchSnapshot();
  const sq2 = tree0.getSortQuery(2);

  const res2 = await testCtx.evalQuery(sq2);
  console.log("sort query depth 2: ");
  util.logTable(res2);
  expect(res2).toMatchSnapshot();

  const jq4 = q4.join(sq1, ["_path0"]).join(sq2, ["_path0", "_path1"]);
  const jres4 = await rtc.evalQuery(jq4);

  console.log("tree query after sort joins:");
  util.logTable(jres4, { maxRows: 50 });
  // Let's skip this snapshot test; the lack of sorting makes it unstable, apparently...
  // expect(jres4).toMatchSnapshot();

  const stq = tree0.getSortedTreeQuery(openPaths);
  const sres = await rtc.evalQuery(stq);

  console.log("result of sorted tree query:");
  util.logTable(sres, { maxRows: 50 });
  expect(sres).toMatchSnapshot();
});

test("public covid19 dataset - aggtree basics", async () => {
  const rtc = new BigQueryConnection(
    "bigquery-public-data",
    "covid19_jhu_csse",
    { showQueries: true }
  );

  const ti = await rtc.getTableInfo(
    "bigquery-public-data.covid19_jhu_csse.summary"
  );
  console.log("tableInfo: ", JSON.stringify(ti, undefined, 2));

  console.log("basic table query:");
  const q1 = reltab.tableQuery("bigquery-public-data.covid19_jhu_csse.summary");
  const q1res = await rtc.evalQuery(q1, 0, 10);
  console.log("q1 query result: row 0: ", q1res.rowData[0], "...");

  const schema = await aggtree.getBaseSchema(rtc, q1);
  log.debug("got aggtree base schema: ", schema);

  const tree0 = aggtree.vpivot(
    rtc,
    q1,
    schema,
    ["country_region", "province_state"],
    null,
    true,
    []
  );
  const rq0 = tree0.rootQuery;
  log.debug("root query exp: ", rq0);

  const res0 = await rtc.evalQuery(rq0!);
  log.debug("root query result:", res0);
  util.logTable(res0);
  expect(res0).toMatchSnapshot();

  const q2 = tree0.applyPath(["US"]);
  const res2 = await rtc.evalQuery(q2);
  log.debug("res2:");
  util.logTable(res2, { maxRows: 10 });
  expect(res2).toMatchSnapshot();

  const openPaths = new PathTree({ '"US"': {} });
  const q3 = tree0.getTreeQuery(openPaths);
  const res3 = await rtc.evalQuery(q3);
  log.debug("res3: ");
  util.logTable(res3, { maxRows: 20 });
  expect(res3).toMatchSnapshot();

  const q4 = tree0.getSortedTreeQuery(openPaths);
  const res4 = await rtc.evalQuery(q4);
  log.debug("res4: ");
  util.logTable(res4, { maxRows: 20 });
});

test("covid19 -- open pivot tree to leaf level", async () => {
  const rtc = new BigQueryConnection(
    "bigquery-public-data",
    "covid19_jhu_csse",
    { showQueries: true }
  );

  const q1 = reltab.tableQuery("bigquery-public-data.covid19_jhu_csse.summary");

  const ti = await rtc.getTableInfo(
    "bigquery-public-data.covid19_jhu_csse.summary"
  );
  console.log("tableInfo: ", JSON.stringify(ti, undefined, 2));

  const schema = await aggtree.getBaseSchema(rtc, q1);
  log.debug("got aggtree base schema: ", schema);

  const tree0 = aggtree.vpivot(
    rtc,
    q1,
    schema,
    ["country_region", "province_state"],
    null,
    true,
    []
  );

  const openPaths = new PathTree({ '"US"': { '"American Samoa"': {} } });
  const q3 = tree0.getTreeQuery(openPaths);
  const res3 = await rtc.evalQuery(q3);
  log.debug("res3: ");
  util.logTable(res3, { maxRows: 20 });
  expect(res3).toMatchSnapshot();

  const q4 = tree0.getSortedTreeQuery(openPaths);
  const res4 = await rtc.evalQuery(q4);
  log.debug("res4: ");
  util.logTable(res4, { maxRows: 20 });
});

test("getSourceInfo basics", async () => {
  const rtc = new BigQueryConnection(
    "bigquery-public-data",
    "covid19_jhu_csse",
    { showQueries: true }
  );

  const rootSourceInfo = await rtc.getSourceInfo([]);
  // console.log("root source info: ", rootSourceInfo);

  const covid_item = rootSourceInfo.children.find(
    (item) => item.id === "covid19_jhu_csse"
  );

  console.log("calling getSourceInfo on item ", covid_item);
  const covidSourceInfo = await rtc.getSourceInfo([covid_item!]);
  console.log("covid19 source info: ", covidSourceInfo);
});
