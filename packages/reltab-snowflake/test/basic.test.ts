import * as reltab from "reltab";
import {
  SnowflakeConnection,
  getAuthConnectionOptions,
} from "../src/reltab-snowflake";
import "../src/reltab-snowflake";
import * as util from "./testUtils";
import * as log from "loglevel";
import * as aggtree from "aggtree";
import { PathTree } from "aggtree";
import { DataSourceId } from "reltab";
import * as snowflake from "snowflake-sdk";

let testConn: SnowflakeConnection;

let connOpts = getAuthConnectionOptions();
connOpts.database = "CITIBIKE";
connOpts.schema = "PUBLIC";

const snowflakeConnKey: DataSourceId = {
  providerName: "snowflake",
  resourceId: connOpts,
};

beforeAll(async () => {
  // log.setLevel(log.levels.DEBUG);

  testConn = (await reltab.getConnection(
    snowflakeConnKey
  )) as SnowflakeConnection;
  log.debug("got testConn: ", testConn);
  const ti = await testConn.getTableInfo("TRIPS");
  log.debug("trips table info: ", ti);
});

const tripsTableQuery = reltab.tableQuery("TRIPS");

test("t2 - basic table query", async () => {
  const qres = await testConn.evalQuery(tripsTableQuery, 0, 20);

  util.logTable(qres, { maxRows: 10 });

  expect(qres).toMatchSnapshot();
});

test("basic rowcount", async () => {
  const rowCount = await testConn.rowCount(tripsTableQuery);

  console.log("row count: ", rowCount);
});
