import * as reltab from "reltab";
import { SnowflakeConnection, getAuthConnectionOptions } from "../src/reltab-snowflake";
import "../src/reltab-snowflake";
import * as util from "./testUtils";
import * as log from "loglevel";
import * as aggtree from "aggtree";
import { PathTree } from "aggtree";
import { DbConnectionKey } from "reltab";
import * as snowflake from "snowflake-sdk";

let testCtx: SnowflakeConnection;

let connOpts = getAuthConnectionOptions();
connOpts.database = "CITIBIKE";
connOpts.schema = "PUBLIC";

const snowflakeConnKey: DbConnectionKey = {
  providerName: "snowflake",
  connectionInfo: connOpts,
};

beforeAll(async () => {
  // log.setLevel(log.levels.DEBUG);

  testCtx = (await reltab.getConnection(
    snowflakeConnKey
  )) as SnowflakeConnection;
  log.debug("got testCtx: ", testCtx);
  const ti = await testCtx.getTableInfo("TRIPS");
  log.debug("trips table info: ", ti);
});

const tripsTableQuery = reltab.tableQuery("TRIPS");

test("t2 - basic table query", async () => {
  const qres = await testCtx.evalQuery(tripsTableQuery, 0, 20);

  util.logTable(qres, { maxRows: 10 });

  expect(qres).toMatchSnapshot();
});

test("basic rowcount", async () => {
  const rowCount = await testCtx.rowCount(tripsTableQuery);

  console.log("row count: ", rowCount);
});
