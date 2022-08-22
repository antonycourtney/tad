/**
 * Import CSV files into sqlite
 */

import { ColumnType, ColumnMetaMap, Schema } from "reltab";
import { SQLiteDialect } from "reltab";
import * as csv from "@fast-csv/parse";
import * as _ from "lodash";
import * as path from "path";
import * as stream from "stream";
import * as through from "through";
import * as fs from "fs";
import * as sqlite3 from "sqlite3";
import * as tp from "typed-promisify";
import * as log from "loglevel";

// No typing info for these guys yet:
const byline = require("byline");
const Gauge = require("gauge");
const CSVSnifferModule = require("csv-sniffer");

const CSVSniffer = CSVSnifferModule();
const delimChars = [",", "\t", "|", ";"];
const sniffer = new CSVSniffer(delimChars);

const coreTypes = SQLiteDialect.coreColumnTypes;
const columnTypes = SQLiteDialect.columnTypes;

const typeLookup = (tnm: string): ColumnType => {
  const ret = columnTypes[tnm] as ColumnType | undefined;
  if (ret == null) {
    throw new Error("typeLookup: unknown type name: '" + tnm + "'");
  }
  return ret;
};

/*
 * regex to match a float or int:
 * allows commas and leading $
 */
const usIntRE = /[-+]?[$]?[0-9,]+/;
const usRealRE = /[-+]?[$]?[0-9,]*\.?[0-9]+([eE][-+]?[0-9]+)?/;

const usNumREs = {
  intRE: usIntRE,
  realRE: usRealRE,
};

// adaptations of these REs for European format, where the
// use of , and . are reversed:
const eurIntRE = /[-+]?[$]?[0-9.]+/;
const eurRealRE = /[-+]?[$]?[0-9.]*,?[0-9]+([eE][-+]?[0-9]+)?/;

const eurNumREs = {
  intRE: eurIntRE,
  realRE: eurRealRE,
};

/*
 * FileMetaData is an array of unique column IDs, column display names and
 * ColumnType for each column in a CSV file.
 * The possible null for ColumnType deals with an empty file (no rows)
 *
 */
export type FileMetadata = {
  columnIds: Array<string>;
  columnNames: Array<string>;
  columnTypes: Array<string | null>;
  rowCount: number;
  tableName: string;
  csvOptions: Object;
};

function assertDefined<A>(x: A | undefined | null): A {
  if (x == null) {
    throw new Error("unexpected null value");
  }
  return x;
}

export const mkTableSchema = (md: FileMetadata): Schema => {
  const extendCMap = (
    cmm: ColumnMetaMap,
    cnm: string,
    idx: number
  ): ColumnMetaMap => {
    const cType = md.columnTypes[idx]?.toLocaleUpperCase();
    if (cType == null) {
      throw new Error(
        'mkTableInfo: No column type for "' + cnm + '", index: ' + idx
      );
    }
    const cmd = {
      displayName: md.columnNames[idx],
      columnType: cType,
    };
    cmm[cnm] = cmd;
    return cmm;
  };
  const cmMap = md.columnIds.reduce(extendCMap, {});
  const schema = new Schema(SQLiteDialect, md.columnIds, cmMap);
  return schema;
};

/**
 * Given the current guess (or null) for a column type and cell value string cs
 * make a conservative guess at column type.
 * We use the order int <: real <: text, and a guess will only become more general.
 * TODO: support various date formats
 */
const guessColumnType =
  (numREs: { [tname: string]: RegExp }) =>
  (
    cg: ColumnType | null | undefined,
    cs: string | null | undefined
  ): ColumnType | null | undefined => {
    if (cg === coreTypes.string) {
      return cg; // already most general case
    }
    if (cs == null || cs.length === 0) {
      return cg; // empty cells don't affect current guess
    }
    if (cg === null || coreTypes.integer) {
      let match = numREs.intRE.exec(cs);
      if (
        match !== null &&
        match.index === 0 &&
        match[0].length === cs.length
      ) {
        return coreTypes.integer;
      }
    }
    // assert: cg !== 'text
    let match = numREs.realRE.exec(cs);
    if (match !== null && match.index === 0 && match[0].length === cs.length) {
      return coreTypes.real;
    } else {
      return coreTypes.string;
    }
  };

/**
 * prepare a raw value string for db insert based on column type
 */
const usBadCharsRE = /[$,]/g;
const eurBadCharsRE = /[$.]/g;
const prepValue = (
  ct: ColumnType | null | undefined,
  vs: string | null | undefined,
  isEuroFormat: boolean
): string | null | undefined => {
  if (vs == null || (vs.length === 0 && ct !== coreTypes.string)) {
    return null;
  }
  if (ct === coreTypes.integer || ct === coreTypes.real) {
    let cs;
    if (isEuroFormat) {
      cs = vs.trim().replace(eurBadCharsRE, "").replace(",", ".");
    } else {
      cs = vs.trim().replace(usBadCharsRE, "");
    }
    return cs;
  }
  // TODO: Will probably need to deal with charset encoding issues for SQLite
  return vs;
};

/**
 * Find all matches of a RegExp in a string
 *
 * TODO: move to some common utility lib
 */
const reFindAll = (re: RegExp, str: string): Array<string> => {
  let matches = [];
  let matchInfo;
  while ((matchInfo = re.exec(str)) !== null) {
    matches.push(matchInfo[0]);
  }
  return matches;
};

/**
 * form a candidate column id by joining words
 *
 */
const MAXIDENT = 16;
const mkColId = (words: Array<string>): string => {
  return words.join("").substr(0, MAXIDENT);
};

/**
 * Use descriptive strings from first (header) row of CSV to generate
 * unique column identifiers with no spaces, suitable for a database.
 *
 * Tries to use the first word of each description to generate a human-friendly
 * column name,  but falls back to simpler 'col'N if that fails.
 *
 * TODO: Place some limit on id length
 *
 * TODO: Can fail if given columns with the dastardly column name 'col<N>'
 *
 * returns: Array<string> of column ids for each column
 */
const identRE = /[a-zA-Z]\w*/g;
const genColumnIds = (headerRow: Array<string>): Array<string> => {
  let columnIds: Array<string> = [];
  let colIdMap: { [cid: string]: number } = {};
  for (var i = 0; i < headerRow.length; i++) {
    let origHeader = headerRow[i];
    let matches = reFindAll(identRE, origHeader);
    var colId: string = mkColId(matches); // form candidate column id
    if (matches.length === 0 || colId.toLowerCase() in colIdMap) {
      let baseColId = "col" + i.toString();
      colId = baseColId;
      // deal with pathological case of a previous column named 'col<i>'
      for (let j = 2; colId.toLowerCase() in colIdMap; j++) {
        colId = baseColId + "_" + j.toString();
      }
    }
    columnIds.push(colId);
    colIdMap[colId.toLowerCase()] = i;
  }
  return columnIds;
};

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

const genColumnNames = (nCols: number): Array<string> => {
  const fmtNum = colNumStr(nCols);
  const columnNames = _.range(nCols).map((x) => fmtNum(x));
  return columnNames;
};

/* scanTypes will read a CSV file and return a Promise<FileMetadata> */
const metaScan = (
  pathname: string,
  delimiter: string,
  options: ImportOpts
): Promise<FileMetadata> => {
  return new Promise((resolve, reject) => {
    // log.debug("starting metascan...");
    const pathStats = fs.statSync(pathname);
    // log.debug("file size: ", pathStats.size);
    const msStart = process.hrtime();
    let firstRow = true;
    var colTypes: Array<ColumnType>;
    let rowCount = 0;
    // extract table name from file path:
    const tableName = genTableName(pathname);

    let csvOptions = { delimiter };
    const pathStream = fs.createReadStream(pathname);

    let gauge = new Gauge();

    const numREs = delimiter === ";" ? eurNumREs : usNumREs;
    const guessFunc = guessColumnType(numREs);

    gauge.show("scanning...", 0);
    let bytesRead = 0;
    const countStream = through(
      function write(this: any, buf) {
        bytesRead += buf.length;
        const pctComplete = bytesRead / pathStats.size;
        const msg = "scanning... ( " + Math.round(pctComplete * 100) + "%)";
        gauge.show(msg, pctComplete);
        this.emit("data", buf);
      },
      function end(this: any) {
        gauge.hide();
        log.debug("countStream: bytesRead: ", bytesRead);
        this.emit("end");
      }
    );

    const hasHeaderRow = !options.noHeaderRow;
    let columnNames: string[];
    let columnIds: string[];

    const csvStream = csv
      .parse(csvOptions)
      .on("data", (row) => {
        if (firstRow && hasHeaderRow) {
          columnNames = row;
          columnIds = genColumnIds(columnNames);
          colTypes = Array(columnIds.length).fill(null);
          firstRow = false;
        } else {
          if (firstRow) {
            columnNames = genColumnNames(row.length);
            columnIds = genColumnIds(columnNames);
            colTypes = Array(columnIds.length).fill(null);
            firstRow = false;
          }
          colTypes = _.zipWith(colTypes, row, guessFunc) as ColumnType[];
          rowCount++;
        }
      })
      .on("end", () => {
        // default any remaining null column types to text:
        const columnTypes = colTypes.map((ct) => ct ?? "text");
        const columnTypeNameStrs = columnTypes.map(
          (ct) => ct.sqlTypeName as string
        );
        const [es, ens] = process.hrtime(msStart);
        log.debug("metascan completed in %ds %dms", es, ens / 1e6);
        resolve({
          columnIds,
          columnNames,
          columnTypes: columnTypeNameStrs,
          rowCount,
          tableName,
          csvOptions,
        });
      });

    pathStream.pipe(countStream).pipe(csvStream);
  });
};

/*
 * A simplified import, since our more complex import is
 */

// maximum number of items outstanding before pause and commit:
// Some studies of sqlite found this number about optimal
const BATCHSIZE = 10000;

/*
 * consume a stream, sending all records to the Promise-returning write
 * function.
 *
 * returns: A Promise that resolves only when all records from readable
 * input stream have been written using wrf.
 * Promise value is number of records written
 */
const consumeStream = (
  s: stream.Readable,
  wrf: (buf: any) => Promise<any>,
  totalItems: number,
  skipFirst: boolean
): Promise<number> => {
  return new Promise((resolve, reject) => {
    let firstItem = true;
    let writeCount = 0;
    let readCount = 0;
    let batchCount = 0;
    let inputDone = false;
    let paused = false;
    let gauge = new Gauge();

    gauge.show("loading data...", 0);
    const pctCount = Math.ceil(totalItems / 100);

    const onData = (row: any) => {
      if (firstItem) {
        firstItem = false;
        if (skipFirst) {
          return;
        }
      }
      readCount++;
      const numOutstanding = readCount - writeCount;
      if (numOutstanding >= BATCHSIZE) {
        s.pause();
        paused = true;
        batchCount = 0;
      }
      wrf(row)
        .then(() => {
          // console.log("wrf completed writing one row");
          writeCount++;
          batchCount++;
          const numOutstanding = readCount - writeCount;
          // We may want to use a low water mark rather than zero here
          if (paused && numOutstanding === 0) {
            s.resume();
            paused = false;
          }
          if (writeCount % pctCount === 0) {
            const pctComplete = writeCount / totalItems;
            const statusMsg =
              "loaded " +
              writeCount +
              "/" +
              totalItems +
              " rows ( " +
              Math.round(pctComplete * 100) +
              "%)";
            gauge.show(statusMsg, pctComplete);
          }
          if (inputDone && numOutstanding === 0) {
            gauge.hide();
            batchCount = 0;
            resolve(writeCount);
          }
        })
        .catch((err) => {
          reject(err);
        });
    };
    const onEnd = () => {
      inputDone = true;
      if (writeCount === readCount) {
        // may have already written all read items
        gauge.hide();
        batchCount = 0;
        resolve(writeCount);
      } else {
        // log.debug('consumeStream: readCount: ', readCount, ', writeCount: ', writeCount)
      }
    };

    let wr = through(onData, onEnd);
    s.pipe(wr);
  });
};

const dbRun = tp.promisify(
  (db: sqlite3.Database, query: string, cb: (res: any, err: any) => void) =>
    db.run(query, cb)
);
const dbRunStmt = tp.promisify(
  (
    db: sqlite3.Database,
    query: string,
    params: any[],
    cb: (res: any, err: any) => void
  ) => db.run(query, params, cb)
);

/*
const stmtRun = tp.promisify(
  (stmt: sqlite3.Statement, params: any[], cb: (res: any, err: any) => void) =>
    stmt.run(...params, cb)
);
*/
function stmtRun(stmt: sqlite3.Statement, params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    stmt.run(params, (res: any, err: any) => {
      console.log("stmt run callback: ", res, err);
      if (res) {
        resolve(res);
      }
      if (err) {
        reject(err);
      }
    });
  });
}

async function stmtRunWrap(
  stmt: sqlite3.Statement,
  params: any[]
): Promise<any> {
  console.log("stmtRunWrap: ", stmt, params);
  try {
    const ret = await stmtRun(stmt, params);
    return ret;
  } catch (err) {
    console.error("caught error in stmtRun: ", err);
    throw err;
  }
}

/**
 * Use metadata to create and populate sqlite table from CSV data
 *
 * returns: Promise<FileMetadata>
 */
const importData = async (
  db: sqlite3.Database,
  md: FileMetadata,
  pathname: string,
  delimiter: string,
  options: ImportOpts
): Promise<FileMetadata> => {
  try {
    const hasHeaderRow = !options.noHeaderRow;
    const isEuroFormat = delimiter === ";";
    const tableName = md.tableName;
    const qTableName = "'" + tableName + "'";
    const dropStmt = "drop table if exists " + qTableName;
    const idts = _.zip(md.columnIds, md.columnTypes);
    const typedCols = idts.map(
      ([cid, ct]) => "'" + cid + "' " + (ct ? ct : "")
    ); // eslint-disable-line
    const schemaStr = typedCols.join(", ");
    const createStmt = "create table " + qTableName + " ( " + schemaStr + " )";

    const insertColIds = [...md.columnIds, "rowid"].map((cid) => `'${cid}'`);
    const insertColIdsStr = "(" + insertColIds.join(", ") + ")";
    const qs = Array(md.columnNames.length + 1).fill("?");
    const insertStmtStr = `insert into ${qTableName}${insertColIdsStr} values (${qs.join(
      ", "
    )})`;
    // console.log("insertStmt: [" + insertStmtStr + "]");
    let insertRowId = 0;
    const insertRow = (row: any): Promise<any> => {
      let rowVals = [];
      for (let i = 0; i < row.length; i++) {
        const t = md.columnTypes[i];
        const v = row[i];
        rowVals.push(prepValue(typeLookup(t!), v, isEuroFormat));
      }
      rowVals.push(insertRowId++);
      // console.log("insertRow: rowVals: ", rowVals);
      return dbRunStmt(db, insertStmtStr, rowVals);
    };

    /*
     * TODO: multiple sources indicate wrapping inserts in a transaction is key to getting
     * decent bulk load performance.
     * We're currently wrapping all inserts in one huge transaction. Should probably break
     * this into more reasonable (50K rows?) chunks.
     */
    await db.run(dropStmt);
    // log.debug("about to run: ", createStmt);
    await db.run(createStmt);
    // log.debug("table created");
    // await db.run("begin");
    // const insertStmt = await db.prepare(insertStmtStr);
    const rowCount = await consumeStream(
      csv.parseFile(pathname, md.csvOptions),
      insertRow,
      md.rowCount,
      hasHeaderRow
    );
    log.debug("consumeStream completed, rowCount: ", rowCount);
    // insertStmt.finalize();
    return md;
  } catch (err) {
    log.error(err, (err as any).stack);
    throw err;
  }
};

/*
 * import the specified CSV file into an in-memory sqlite table,
 * using nodeJS streams for processing the data.
 *
 * Not particularly fast, but should be fairly maintainable.
 *
 * returns: Promise<tableName: string>
 *
 */
export const streamCSVImport = async (
  db: sqlite3.Database,
  pathname: string,
  delimiter: string,
  options: ImportOpts
): Promise<FileMetadata> => {
  const md = await metaScan(pathname, delimiter, options);
  // log.debug("metascan complete. metadata:", md);
  return importData(db, md, pathname, delimiter, options);
};

const readSampleLines = (
  path: string,
  lcount: number
): Promise<Array<string>> => {
  return new Promise((resolve, reject) => {
    const ret: string[] = [];
    const fstream = fs.createReadStream(path, { encoding: "utf8" });
    const lstream = byline(fstream);
    let linesRead = 0;
    lstream.on("readable", () => {
      while (linesRead < lcount) {
        let line;
        line = lstream.read();
        if (line === null) {
          resolve(ret);
          return;
        } else {
          ret.push(line);
          linesRead++;
        }
      }
      fstream.pause();
      resolve(ret);
    });
  });
};

/*
 * extract array of items from string with one row of CSV data.
 *
 * Used to extract column headers and to count number of columns
 */
const extractRowData = (
  headerLine: string,
  delimiter: string
): Promise<Array<string>> => {
  return new Promise((resolve, reject) => {
    csv
      .parseString(headerLine, { headers: false, delimiter })
      .on("data", (data) => {
        resolve(data);
      });
  });
};

interface ImportOpts {
  delimiter?: string;
  columnIds?: string[];
  noHeaderRow?: boolean;
}

interface ImportResult {
  tableName: string;
  columnIds: string[];
  columnTypes: string[];
  rowCount: number;
}

const dbImport: (
  db: sqlite3.Database,
  fnm: string,
  tnm: string,
  opts: ImportOpts
) => Promise<ImportResult> = tp.promisify(
  (
    db: sqlite3.Database,
    fnm: string,
    tnm: string,
    opts: any,
    cb: (err: any, res: any) => void
  ) => (db as any).import(fnm, tnm, opts, cb)
);

// Construct a function to format a number with leading 0s for reasonable alpha sort
const colNumStr = (len: number) => {
  const padCount = Math.log10(len + 1);
  return (x: number): string => "col" + x.toString().padStart(padCount, "0");
};

/*
 * TODO: rename, since this may or may not do a fast import.
 */
export const fastImport = async (
  db: sqlite3.Database,
  pathname: string,
  options: ImportOpts = {}
): Promise<string> => {
  const importStart = process.hrtime();
  try {
    const sampleLines = await readSampleLines(pathname, 2);
    const sample = sampleLines.join("\n");
    const sniffRes = sniffer.sniff(sample, { hasHeader: true });
    const delimiter = sniffRes.delimiter;
    // We use to only call streamCSVImport for cases (like European CSV format)
    // that couldn't be handled by the dbImport function (implemented in C++)
    // But we're ditching our fork of sqlite3, so now we call streamCSVImport unconditionally:
    const md = await streamCSVImport(db, pathname, delimiter, options);
    return md.tableName;
    /*
    if (delimiter === ";") {
      // assume European number format, use JS import impl:
      const md = await streamCSVImport(db, pathname, delimiter, options);
      return md.tableName;
    } else {
      const firstRowData = await extractRowData(sampleLines[0], delimiter);
      let columnNames;
      const noHeaderRow = options.noHeaderRow;
      if (noHeaderRow) {
        columnNames = genColumnNames(firstRowData.length);
      } else {
        columnNames = firstRowData;
      }
      const columnIds = genColumnIds(columnNames);
      const tableName = genTableName(pathname);
      const importOpts = { columnIds, delimiter, noHeaderRow };
      const res = await dbImport(db, pathname, tableName, importOpts);
      const [es, ens] = process.hrtime(importStart);
      log.debug("fastImport: import completed in %ds %dms", es, ens / 1e6);
      // log.debug('import info: ', res)
      const fileMetadata = {
        columnIds: res.columnIds,
        columnNames: columnNames,
        columnTypes: res.columnTypes,
        rowCount: res.rowCount,
        tableName: res.tableName,
        csvOptions: {},
      };
      return res.tableName;
    }
*/
  } catch (err) {
    log.error("caught error during fastImport: ", err, (err as any).stack);
    throw err;
  }
};
