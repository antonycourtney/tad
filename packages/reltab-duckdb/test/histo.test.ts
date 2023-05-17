import * as duckdb from "duckdb-async";
import * as _ from "lodash";
import * as reltab from "reltab";
import {
  asString,
  DataSourceConnection,
  DbDataSource,
  DuckDBDialect,
  tableQuery,
  binsForColumn,
  columnHistogramQuery,
  getNumericColumnHistogramData,
} from "reltab";
import * as reltabDuckDB from "../src/reltab-duckdb";
import * as util from "./testUtils";
import { getFormattedRows } from "./testUtils";

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

const intType = DuckDBDialect.columnTypes["INTEGER"];

test("histogram query for column", async () => {
  const schema = await testCtx.getSchema(q1);
  const qres = await testCtx.evalQuery(q1);

  const tcoeColumnStats = qres.schema.columnMetadata["TCOE"]
    .columnStats as reltab.NumericSummaryStats;

  const histoInfo = columnHistogramQuery(q1, "TCOE", intType, tcoeColumnStats);

  console.log("histoInfo: ", histoInfo);

  const histoRes = await testCtx.evalQuery(histoInfo!.histoQuery);
  util.logTable(histoRes);

  const histoData = getNumericColumnHistogramData("TCOE", histoInfo!, histoRes);
  console.log("histogram data:", histoData);
  expect(histoData).toMatchSnapshot();
});
