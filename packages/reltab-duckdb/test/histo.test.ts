import * as duckdb from "duckdb-async";
import * as _ from "lodash";
import * as reltab from "reltab";
import {
  asString,
  DataSourceConnection,
  DbDataSource,
  tableQuery,
} from "reltab";
import * as reltabDuckDB from "../src/reltab-duckdb";
import * as util from "./testUtils";
import { getFormattedRows } from "./testUtils";
import { binsForColumn, columnHistogramQuery } from "../src/reltab-duckdb";

const { col, constVal } = reltab;

const coreTypes = reltab.SQLiteDialect.coreColumnTypes;

let testCtx: DbDataSource;

const q1 = reltab.tableQuery("barttest");

beforeAll(async (): Promise<DataSourceConnection> => {
  const ctx = await reltab.getConnection({
    providerName: "duckdb",
    resourceId: ":memory:",
  });

  testCtx = ctx as DbDataSource;

  const dbds = ctx as DbDataSource;
  const duckDbDriver = dbds.db as reltabDuckDB.DuckDBDriver;

  await reltabDuckDB.nativeCSVImport(
    duckDbDriver.db,
    "test/support/sample.csv"
  );
  await reltabDuckDB.nativeCSVImport(
    duckDbDriver.db,
    "test/support/barttest.csv"
  );

  return testCtx;
});

test("basic column stats and bin count", async () => {
  const qres = await testCtx.evalQuery(q1);

  const tcoeColumnStats = qres.schema.columnMetadata["TCOE"]
    .columnStats as reltab.NumericSummaryStats;

  expect(tcoeColumnStats).toMatchSnapshot();

  const binCount = binsForColumn(tcoeColumnStats);

  console.log("*** number of histogram bins: ", binCount);
});

test("histogram query for column", async () => {
  const schema = await testCtx.getSchema(q1);
  const qres = await testCtx.evalQuery(q1);

  const tcoeColumnStats = qres.schema.columnMetadata["TCOE"]
    .columnStats as reltab.NumericSummaryStats;

  const histoInfo = columnHistogramQuery(q1, schema, "TCOE", tcoeColumnStats);

  console.log("histoInfo: ", histoInfo);

  const histoRes = await testCtx.evalQuery(histoInfo!.histoQuery);
  console.log("*** histoRes: ");
  util.logTable(histoRes);
});
