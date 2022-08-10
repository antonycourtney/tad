import * as duckdb from "ac-node-duckdb";
import * as reltab from "reltab";
import * as reltabDuckDB from "../src/reltab-duckdb";
import * as tp from "typed-promisify";
import { textSpanContainsPosition, textSpanContainsTextSpan } from "typescript";
import { delimiter } from "path";
import * as log from "loglevel";
import * as util from "./testUtils";
import * as _ from "lodash";
import { asString, Row, Schema, tableQuery, TableRep } from "reltab";
import { getFormattedRows } from "./testUtils";

let testCtx: reltabDuckDB.DuckDBContext;

beforeAll(async (): Promise<reltabDuckDB.DuckDBContext> => {
  const ctx = await reltab.getConnection({
    providerName: "duckdb",
    resourceId: ":memory:",
  });

  testCtx = ctx as reltabDuckDB.DuckDBContext;

  return testCtx;
});

const importParquet = async (
  db: duckdb.DuckDB,
  path: string
): Promise<string> => {
  const tableName = await reltabDuckDB.nativeParquetImport(db, path);
  return tableName;
};

test("https import test", async () => {
  const tableName = await importParquet(
    testCtx.db,
    "https://github.com/deepcrawl/node-duckdb/raw/master/src/tests/test-fixtures/alltypes_plain.parquet"
  );

  // console.log("https import complete, tableName: ", tableName);

  const q1 = reltab.tableQuery(tableName);
  const qres = await testCtx.evalQuery(q1);
  // console.log("basic tableQuery result: ", qres);

  const q2 = q1.project([
    "id",
    "bool_col",
    "int_col",
    "string_col",
    "timestamp_col",
  ]);
  const q2res = await testCtx.evalQuery(q2);

  const q2sres = JSON.stringify(q2res, null, 2);

  //  console.log("project query result: ", q2sres );
  expect(q2sres).toMatchSnapshot();

  const fmtRows = getFormattedRows(qres);
  // console.log("fmtRows: ", fmtRows);
  expect(fmtRows).toMatchSnapshot();
});

test("s3 import test", async () => {
  const dbc = testCtx;

  let importSucceeded = false;
  let tableName: string = "";
  // const s3URL = 's3://ursa-labs-taxi-data/2009/01/data.parquet';
  const s3URL =
    "s3://amazon-reviews-pds/parquet/product_category=Books/part-00000-495c48e6-96d6-4650-aa65-3c36a3516ddd.c000.snappy.parquet";
  try {
    tableName = await importParquet(testCtx.db, s3URL);
    console.log("s3 import complete, tableName: ", tableName);
    importSucceeded = true;
  } catch (err) {
    console.error("caught error during s3 import: ", err);
  }
  expect(importSucceeded).toBe(true);
}, 15000);
