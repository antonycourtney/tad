import fetch from "node-fetch";
import * as reltab from "reltab";
import * as log from "loglevel";

const testBaseUrl = "http://localhost:9000";
const testTable = "movie_metadata";

async function main() {
  log.setLevel(log.levels.INFO);
  const testQuery = reltab.tableQuery(testTable);
  const testUrl = testBaseUrl + "/tadweb/getRowCount";

  const req = { query: testQuery };

  log.info("sending request: ", req);

  const response = await fetch(testUrl, {
    method: "post",
    body: JSON.stringify(req),
    headers: { "Content-Type": "application/json" }
  });

  const result = await response.json();

  log.info("got result: ", result);
}

main();
