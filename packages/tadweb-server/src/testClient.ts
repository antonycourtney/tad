import fetch from "node-fetch";
import * as reltab from "reltab";
import * as log from "loglevel";

const testBaseUrl = "http://localhost:9000";
const testTable = "movie_metadata";

async function request(path: string, args: any): Promise<any> {
  const url = testBaseUrl + path;
  const response = await fetch(url, {
    method: "post",
    body: JSON.stringify(args),
    headers: { "Content-Type": "application/json" },
  });
  return response.json();
}

async function testGetRowCount() {
  const testQuery = reltab.tableQuery(testTable);
  const args = { query: testQuery };
  log.info("testGetRowCount: ", args);
  const response = await request("/tadweb/getRowCount", args);
  log.info("testGetRowCount: got result: ", response);
}

async function testGetTableInfo() {
  const args = { tableName: "movie_metadata" };
  log.info("testGetTableInfo: ", args);
  const response = await request("/tadweb/getTableInfo", args);
  log.info("testGetTableInfo: got result: ", JSON.stringify(response, null, 2));
}

async function main() {
  log.setLevel(log.levels.INFO);
  await testGetRowCount();
  await testGetTableInfo();
}

main();
