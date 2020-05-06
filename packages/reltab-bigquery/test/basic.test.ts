import * as reltab from "reltab";
import { BigQueryConnection } from "../src/reltab-bigquery";
import * as log from "loglevel";

const PROJECT_ID = "";

beforeAll(() => {
  log.setLevel(log.levels.DEBUG);
});

test("t0 - basic functionality", async () => {
  const rtc = new BigQueryConnection(
    "bigquery-public-data",
    "covid19_jhu_csse",
    { showQueries: true }
  );

  const ti = await rtc.getTableInfo(
    "bigquery-public-data.covid19_jhu_csse.summary"
  );
  console.log("tableInfo: ", ti);

  console.log("basic table query:");
  const q1 = reltab.tableQuery("bigquery-public-data.covid19_jhu_csse.summary");
  const q1res = await rtc.evalQuery(q1, 0, 100);
  console.log("q1 query result: ", q1res);
});
