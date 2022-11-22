/**
 * Import CSV files into DuckDb
 */

import * as log from "loglevel";
import * as path from "path";
import { Connection, Database } from "duckdb-async";
import * as prettyHRTime from "pretty-hrtime";
import { initS3 } from "./s3utils";
let uniqMap: { [cid: string]: number } = {};

/* add a numeric _N suffix to an identifer to make it unique */
const uniquify = (src: string): string => {
  let entry = uniqMap[src];
  if (entry === undefined) {
    uniqMap[src] = 1;
    return src; // no suffix needed
  }
  const ret = src + "_" + entry.toString();
  uniqMap[src] = ++entry;
  return ret;
};

/* map to alphanumeric */
const mapIdent = (src: string): string => {
  const ret = src.replace(/[^a-z0-9_]/gi, "_");
  return ret;
};

const isAlpha = (ch: string): boolean => /^[A-Z]$/i.test(ch);

const MAXLEN = 16;

/* generate a SQL table name from pathname */
const genTableName = (pathname: string): string => {
  const extName = path.extname(pathname);
  const baseName = path.basename(pathname, extName);
  let baseIdent = mapIdent(baseName);
  if (baseIdent.length >= MAXLEN) {
    baseIdent = baseIdent.slice(0, MAXLEN);
  }
  if (!isAlpha(baseIdent[0])) {
    baseIdent = "t_" + baseIdent;
  }
  const tableName = uniquify(baseIdent);
  return tableName;
};

/**
 * Native import using DuckDB's built-in import facilities.
 */
export const nativeCSVImport = async (
  db: Database,
  filePath: string
): Promise<string> => {
  const importStart = process.hrtime();

  const dbConn = await db.connect();
  await initS3(dbConn);
  const tableName = genTableName(filePath);
  const query = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${filePath}')`;
  // console.log('nativeCSVImport: executing: ', query);
  try {
    /*
    const resObj = await dbConn.executeIterator(query);
    const resRows = resObj.fetchAllRows() as any[];
*/
    const resRows = await dbConn.all(query);
    // console.log('nativeCSVImport: result: ', resRows[0]);
    const info = resRows[0];
    // console.log('info.Count: \"' + info.Count + '\", type: ', typeof info.Count);
  } catch (err) {
    console.log("caught exception while importing: ", err);
    console.log("retrying with SAMPLE_SIZE=-1:");
    const noSampleQuery = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${filePath}', sample_size=-1)`;
    try {
      /*
      const resObj = await dbConn.executeIterator(noSampleQuery);
      const resRows = resObj.fetchAllRows() as any[];
      */
      const resRows = await dbConn.all(noSampleQuery);
      // console.log('nativeCSVImport: result: ', resRows[0]);
      const info = resRows[0];
      log.debug(
        'nativeCSVImport: info.Count: "' + info.Count + '", type: ',
        typeof info.Count
      );
    } catch (noSampleErr) {
      console.log("caught exception with no sampling: ", noSampleErr);
      throw noSampleErr;
    }
  }
  const importTime = process.hrtime(importStart);
  log.info(
    "DuckDB nativeCSVImport: import completed in ",
    prettyHRTime(importTime)
  );

  return tableName;
};

/**
 * Native import using DuckDB's built-in import facilities.
 */
export const nativeParquetImport = async (
  db: Database,
  filePath: string
): Promise<string> => {
  const importStart = process.hrtime();

  const dbConn = await db.connect();
  await initS3(dbConn);
  const tableName = genTableName(filePath);
  const query = `CREATE VIEW ${tableName} AS SELECT * FROM parquet_scan('${filePath}')`;
  log.debug("*** parquet import: ", query);
  try {
    // Creating a view doesn't return a useful result.
    await dbConn.exec(query);
  } catch (err) {
    console.log("caught exception while importing: ", err);
    throw err;
  }
  const [es, ens] = process.hrtime(importStart);
  log.info(
    "DuckDB nativeParquetImport: import completed in %ds %dms",
    es,
    ens / 1e6
  );

  return tableName;
};
