/**
 * Import CSV files into DuckDb
 */

import * as path from "path";
import { Connection, DuckDB } from "node-duckdb";

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

/* generate a SQL table name from pathname */
const genTableName = (pathname: string): string => {
  const extName = path.extname(pathname);
  const baseName = path.basename(pathname, extName);
  let baseIdent = mapIdent(baseName);
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
  db: DuckDB,
  filePath: string
): Promise<string> => {
  const importStart = process.hrtime();

  const dbConn = new Connection(db);
  const tableName = genTableName(filePath);
  const query = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${filePath}')`;
  // console.log('nativeCSVImport: executing: ', query);
  try {
    const resObj = await dbConn.executeIterator(query);
    const resRows = resObj.fetchAllRows() as any[];
    // console.log('nativeCSVImport: result: ', resRows[0]);
    const info = resRows[0];
    // console.log('info.Count: \"' + info.Count + '\", type: ', typeof info.Count);
  } catch (err) {
    console.log("caught exception while importing: ", err);
    console.log("retrying with SAMPLE_SIZE=-1:");
    const noSampleQuery = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${filePath}', sample_size=-1)`;
    try {
      const resObj = await dbConn.executeIterator(noSampleQuery);
      const resRows = resObj.fetchAllRows() as any[];
      // console.log('nativeCSVImport: result: ', resRows[0]);
      const info = resRows[0];
      console.log(
        'nativeCSVImport: info.Count: "' + info.Count + '", type: ',
        typeof info.Count
      );
    } catch (noSampleErr) {
      console.log("caught exception with no sampling: ", noSampleErr);
    }
  } finally {
    dbConn.close();
  }
  const [es, ens] = process.hrtime(importStart);
  console.log(
    "DuckDB nativeCSVImport: import completed in %ds %dms",
    es,
    ens / 1e6
  );

  return tableName;
};

/**
 * Native import using DuckDB's built-in import facilities.
 */
export const nativeParquetImport = async (
  db: DuckDB,
  filePath: string
): Promise<string> => {
  const importStart = process.hrtime();

  const dbConn = new Connection(db);
  const tableName = genTableName(filePath);
  const query = `CREATE TABLE ${tableName} AS SELECT * FROM parquet_scan('${filePath}')`;
  try {
    const resObj = await dbConn.executeIterator(query);
    const resRows = resObj.fetchAllRows() as any[];
    // console.log('nativeParquetImport: result: ', resRows[0]);
    const info = resRows[0];
    // console.log('info.Count: \"' + info.Count + '\", type: ', typeof info.Count);
  } catch (err) {
    console.log("caught exception while importing: ", err);
  } finally {
    dbConn.close();
  }
  const [es, ens] = process.hrtime(importStart);
  console.log(
    "DuckDB nativeParquetImport: import completed in %ds %dms",
    es,
    ens / 1e6
  );

  return tableName;
};
