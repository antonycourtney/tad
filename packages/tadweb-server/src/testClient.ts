/*
 * NOTE:  This code is now totally broken / deprecated.
 *
 * TODO: Get this working again, using the /tadweb/invoke endpoint and the common reltab remote server
 *
 */

import fetch from "node-fetch";
import * as reltab from "reltab";
import * as log from "loglevel";

const testBaseUrl = "http://localhost:9000";
const testFile = "movie_metadata.csv";

async function request(path: string, args: any): Promise<any> {
  const url = testBaseUrl + path;
  const response = await fetch(url, {
    method: "post",
    body: JSON.stringify(args),
    headers: { "Content-Type": "application/json" },
  });
  return response.json();
}

async function testGetRowCount(tableName: string) {
  const testQuery = reltab.tableQuery(tableName);
  const args = { query: testQuery };
  log.info("testGetRowCount: ", args);
  const response = await request("/tadweb/getRowCount", args);
  log.info("testGetRowCount: got result: ", response);
}

async function testGetTableInfo(tableName: string) {
  const args = { tableName };
  log.info("testGetTableInfo: ", args);
  const response = await request("/tadweb/getTableSchema", args);
  log.info("testGetTableInfo: got result: ", JSON.stringify(response, null, 2));
}

async function testImport(fileName: string): Promise<string> {
  const args = { fileName };
  log.info("testImport: ", args);
  const response = await request("/tadweb/importFile", args);
  log.info("testImport: got result: ", JSON.stringify(response, null, 2));
  return response.tableName;
}

async function main() {
  log.setLevel(log.levels.INFO);
  const tableName = await testImport(testFile);
  await testGetRowCount(tableName);
  await testGetTableInfo(tableName);
}

main();
