import * as duckdb from "duckdb-async";
import * as _ from "lodash";
import * as reltab from "reltab";
import {
  asString,
  cast,
  DataSourceConnection,
  DbDataSource,
  divide,
  minus,
  multiply,
  round,
  tableQuery,
} from "reltab";
import * as reltabDuckDB from "../src/reltab-duckdb";
import * as util from "./testUtils";
import { getFormattedRows } from "./testUtils";

const { col, constVal } = reltab;

const coreTypes = reltab.SQLiteDialect.coreColumnTypes;

let testCtx: DataSourceConnection;

const q1 = reltab.tableQuery("barttest");

test("t0 - trivial query generation", () => {
  expect(q1).toMatchInlineSnapshot(`
    QueryExp {
      "_rep": Object {
        "operator": "table",
        "tableName": "barttest",
      },
      "expType": "QueryExp",
    }
  `);
});

const importCsv = async (db: duckdb.Database, path: string) => {
  await reltabDuckDB.nativeCSVImport(db, path);
};

beforeAll(async (): Promise<DataSourceConnection> => {
  const ctx = await reltab.getConnection({
    providerName: "duckdb",
    resourceId: ":memory:",
  });

  testCtx = ctx;

  const dbds = ctx as DbDataSource;
  const duckDbDriver = dbds.db as reltabDuckDB.DuckDBDriver;

  await importCsv(duckDbDriver.db, "test/support/sample.csv");
  await importCsv(duckDbDriver.db, "test/support/barttest.csv");

  return testCtx;
});

test("t1 - basic sqlite tableQuery", async () => {
  const q1 = reltab.tableQuery("sample");
  const qres = await testCtx.evalQuery(q1);
  expect(qres).toMatchSnapshot();
});

test("q1 - basic sqlQuery", async () => {
  const q1 = reltab.sqlQuery("select 42 as num");
  const qres = await testCtx.evalQuery(q1);
  expect(qres).toMatchSnapshot();
});

const bartTableQuery = reltab.tableQuery("barttest");

test("t2 - basic bart table query", async () => {
  const dbds = testCtx as DbDataSource;

  const sqlQuery = await dbds.getSqlForQuery(bartTableQuery);
  console.log("*** sql for basic table query:\n", sqlQuery);

  const qres = await testCtx.evalQuery(bartTableQuery);

  expect(qres).toMatchSnapshot();
});

const qtex = bartTableQuery.extend("foo", constVal(99));
test("trivial table extend with const col", async () => {
  const res = await testCtx.evalQuery(qtex);
  expect(res).toMatchSnapshot();
});

test("basic rowcount", async () => {
  const rowCount = await testCtx.rowCount(bartTableQuery);

  expect(rowCount).toBe(23);
});

const pcols = ["Job Family", "Title", "Union", "Name", "Base", "TCOE"];
const q2 = bartTableQuery.project(pcols);

test("basic project operator", async () => {
  const qres = await testCtx.evalQuery(q2);
  expect(qres.schema.columns).toEqual(pcols);

  expect(qres).toMatchSnapshot();
});

test("table and schema deserialization", async () => {
  const qres = await testCtx.evalQuery(q2);

  /*
  console.log(
    "qres schema, Job Family column type: ",
    qres.schema.columnType("Job Family")
  );
  */
  const qresStr = JSON.stringify(qres, undefined, 2);

  const deserRes = reltab.deserializeTableRepStr(qresStr);

  const jfct = deserRes.schema.columnType("Job Family");
  expect(typeof jfct.stringRender).toBe("function");
});

test("basic groupBy", async () => {
  const q3 = bartTableQuery.groupBy(["Job Family", "Title"], ["TCOE"]); // note: [ 'TCOE' ] equivalent to [ [ 'sum', 'TCOE' ] ]

  // testCtx.showQueries = true;
  const qres = await testCtx.evalQuery(q3);

  const expCols = ["Job Family", "Title", "TCOE"];
  expect(qres.schema.columns).toEqual(expCols);

  expect(qres.rowData.length).toBe(19);

  const baseRes = await testCtx.evalQuery(bartTableQuery);
  const tcoeSum = util.columnSum(baseRes, "TCOE");

  const groupSum = util.columnSum(qres, "TCOE");
  expect(BigInt(groupSum)).toBe(BigInt(tcoeSum));

  expect(qres).toMatchSnapshot();
});

const q5 = bartTableQuery.filter(
  reltab.and().eq(col("Job Family"), constVal("Executive Management"))
);

test("basic filter", async () => {
  const res = await testCtx.evalQuery(q5);
  expect(res.rowData.length).toBe(4);

  expect(res).toMatchSnapshot();
});

test("escaped literal string filter", async () => {
  // Test for literal string with single quote (which must be escaped):
  const q5b = q1.filter(
    reltab
      .and()
      .eq(col("Title"), constVal("Department Manager Gov't & Comm Rel"))
  );

  const res = await testCtx.evalQuery(q5b);

  expect(res.rowData.length).toBe(1);
});

test("empty and filter", async () => {
  const q5c = q1.filter(reltab.and());

  const res = await testCtx.evalQuery(q5c);
  expect(res.rowData.length).toBe(23);
});

test("query deserialization", async () => {
  let req: Object = { query: q5 };
  const ser5 = JSON.stringify(req, null, 2);
  const dq5 = reltab.deserializeQueryReq(ser5);
  const rtc = testCtx;
  const res = await rtc.evalQuery(dq5.query);
  expect(res.rowData.length).toBe(4);
});

const q6 = q1.mapColumns({
  Name: { id: "EmpName", displayName: "Employee Name" },
});

test("mapColumns", async () => {
  const res = await testCtx.evalQuery(q6);
  const rs = res.schema;
  expect(rs.columns[0]).toBe("EmpName");
  const em = rs.columnMetadata["EmpName"];
  expect(em.columnType).toBe("VARCHAR");
  expect(em.displayName).toBe("Employee Name");
  expect(res.rowData.length).toBe(23);
});

const q7 = q1.mapColumnsByIndex({
  0: { id: "EmpName" },
});

test("mapColumnsByIndex", async () => {
  const res = await testCtx.evalQuery(q7);
  const rs = res.schema;
  expect(rs.columns[0]).toBe("EmpName");
  const em = rs.columnMetadata["EmpName"];
  expect(res.rowData.length).toBe(23);
});

const q8 = q5.concat(
  q1.filter(reltab.and().eq(col("Job Family"), constVal("Safety")))
);

test("concat", async () => {
  const res = await testCtx.evalQuery(q8);
  expect(res.rowData.length).toBe(5);
  const jobCol = res.getColumn("Job Family");
  const jobs = _.sortedUniq(jobCol);
  expect(jobs).toEqual(["Executive Management", "Safety"]);
});

const q9 = q8.sort([["Name", true]]);

test("basic sort", async () => {
  const res = await testCtx.evalQuery(q9);
  expect(res).toMatchSnapshot();
});

const q10 = q8.sort([
  ["Job Family", true],
  ["TCOE", false],
]);

test("compound key sort", async () => {
  const res = await testCtx.evalQuery(q10);
  expect(res).toMatchSnapshot();
});

const qex1 = q8.extend("_depth", constVal(0));
test("basic extend with const col", async () => {
  const res = await testCtx.evalQuery(qex1);
  expect(res).toMatchSnapshot();
});

const qex2 = qex1.project(["Name", "Title", "Job Family", "TCOE", "_depth"]);
test("basic extend composed with project", async () => {
  const res = await testCtx.evalQuery(qex2);
  expect(res).toMatchSnapshot();
});

const qex3 = q1
  .extend("_pivot", asString(constVal(null)))
  .extend("_depth", constVal(0));

test("chained extend", async () => {
  // console.log("chained extend: query: ", JSON.stringify(qex3, undefined, 2));
  const res = await testCtx.evalQuery(qex3);
  // util.logTable(res);
  expect(res).toMatchSnapshot();
});

const qex4 = q1.extend("_pivot", asString(constVal(null)));
test("null const extend", async () => {
  const res = await testCtx.evalQuery(qex4);
  // util.logTable(res);
  expect(res).toMatchSnapshot();
});

const qex5 = q1.extend("Overhead", minus(col("TCOE"), col("Base")));
test("extend with binary expression col", async () => {
  const res = await testCtx.evalQuery(qex5);
  console.log("*** qex5 result: ");
  util.logTable(res);
  expect(res).toMatchSnapshot();
});

const realType = reltab.DuckDBDialect.columnTypes["REAL"];

const qex6 = q1.extend(
  "BasePct",
  divide(cast(col("Base"), realType), cast(col("TCOE"), realType))
);
test("extend with binary expression col and casts", async () => {
  const res = await testCtx.evalQuery(qex6);
  console.log("*** qex6 result: ");
  util.logTable(res);
  expect(res).toMatchSnapshot();
});

const qex7 = qex6.extend(
  "BasePctInt",
  round(multiply(col("BasePct"), cast(constVal(100), realType)))
);
test("extend with unary op round", async () => {
  const res = await testCtx.evalQuery(qex7);
  console.log("*** qex7 result: ");
  util.logTable(res);
  expect(res).toMatchSnapshot();
});

test("getSourceInfo basics", async () => {
  const rtc = testCtx;
  const rootNode = await rtc.getRootNode();
  console.log("root node: ", rootNode);

  expect(rootNode).toMatchSnapshot();
  /*  
  const covid_item = rootSourceInfo.children.find(
    (item) => item.id === "covid19_jhu_csse"
  );

  console.log("calling getSourceInfo on item ", covid_item);
  const covidSourceInfo = await rtc.getSourceInfo([covid_item!]);
  console.log("covid19 source info: ", covidSourceInfo);
*/
});

test("basic DuckDb types", async () => {
  const dbc = testCtx;

  const dbds = dbc as DbDataSource;
  const driver = dbds.db as reltabDuckDB.DuckDBDriver;

  await driver.runSqlQuery("create table basic_ttest(i integer,b boolean); ");
  await driver.runSqlQuery("insert into basic_ttest values (99, true);");
  await driver.runSqlQuery("insert into basic_ttest values (87, false);");

  const q0 = tableQuery("basic_ttest");
  const q0res = await dbc.evalQuery(q0);
  const rowData = q0res.rowData;
  console.log("rowData: ", rowData);

  expect(rowData).toMatchInlineSnapshot(`
    Array [
      Object {
        "b": true,
        "i": 99,
      },
      Object {
        "b": false,
        "i": 87,
      },
    ]
  `);
});

test("DuckDb date type", async () => {
  const dbc = testCtx;

  const dbds = dbc as DbDataSource;
  const driver = dbds.db as reltabDuckDB.DuckDBDriver;

  await driver.runSqlQuery("create table date_ttest(d date); ");
  await driver.runSqlQuery("insert into date_ttest values ('1991-07-21');");
  await driver.runSqlQuery("insert into date_ttest values ('2022-02-11');");

  const q0 = tableQuery("date_ttest");
  const q0res = await dbc.evalQuery(q0);
  const rowData = q0res.rowData;
  console.log("rowData: ", rowData);

  expect(rowData).toMatchInlineSnapshot(`
    Array [
      Object {
        "d": 1991-07-21T00:00:00.000Z,
      },
      Object {
        "d": 2022-02-11T00:00:00.000Z,
      },
    ]
  `);
});

test("DuckDb timestamp types", async () => {
  const dbc = testCtx;
  const dbds = dbc as DbDataSource;
  const driver = dbds.db as reltabDuckDB.DuckDBDriver;

  const d1 = "1991-07-21T11:30:00.000Z";
  const d2 = "2022-02-11T14:15:45.000Z";

  // NOTE:
  // fully uniform results with duckdb-node blocked on https://github.com/duckdb/duckdb-node/issues/13.
  // Once this issue is fixed, we can comment out the timestamp_ns, timestamp_ms, and timestamp_s
  // columns and add the results to the snapshot.
  await driver.runSqlQuery(
    `
    create table timestamp_test as (
      select '${d1}' as t,
      cast('${d1}' as TIMESTAMP WITH TIME ZONE) as tz,
      -- cast('${d1}' as timestamp_ns) as t_ns,
      -- cast('${d1}' as timestamp_ms) as t_ms,
      -- cast('${d1}' as timestamp_s) as t_s,
      cast('${d1}' as datetime) as dt,
      cast('${d1}' as date) as d
      UNION ALL select
      '${d2}' as t,
      cast('${d2}' as TIMESTAMP WITH TIME ZONE) as tz,
      -- cast('${d2}' as timestamp_ns) as t_ns,
      -- cast('${d2}' as timestamp_ms) as t_ms,
      -- cast('${d2}' as timestamp_s) as t_s,
      cast('${d2}' as datetime) as dt,
      cast('${d2}' as date) as d
      );`
  );

  const q0 = tableQuery("timestamp_test");
  const q0res = await dbc.evalQuery(q0);

  const fmtRows = getFormattedRows(q0res);

  expect(fmtRows).toMatchInlineSnapshot(`
    Array [
      Array [
        "1991-07-21T11:30:00.000Z",
        "1991-07-21T11:30:00.000Z",
        "1991-07-21T11:30:00.000Z",
        "1991-07-21",
      ],
      Array [
        "2022-02-11T14:15:45.000Z",
        "2022-02-11T14:15:45.000Z",
        "2022-02-11T14:15:45.000Z",
        "2022-02-11",
      ],
    ]
  `);
});

/*
 * We'd need to put back expression syntax in extend first:
const q11 = q8.extend('ExtraComp', {type: 'integer'}, col('TCOE - Base'));
const dbTest11 = (htest) => {
  sqliteQueryTest(htest, 'extend with expression', q11, (t, res) => {
    util.logTable(res)
    t.end()
  })
}
*/
