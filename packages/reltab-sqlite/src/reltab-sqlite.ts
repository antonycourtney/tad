import * as tp from "typed-promisify";
import * as sqlite3 from "sqlite3";
import * as log from "loglevel";
import {
  TableRep,
  QueryExp,
  Schema,
  TableInfoMap,
  TableInfo,
  Row,
  ColumnMetaMap,
  Connection,
  SQLiteDialect,
  ColumnType,
  DataSourcePath,
  DataSourceNode,
  DataSourceNodeId,
} from "reltab"; // eslint-disable-line
import { SQLDialect } from "reltab/dist/dialect";

export * from "./csvimport";

const columnTypes = SQLiteDialect.columnTypes;

const typeLookup = (tnm: string): ColumnType => {
  const ret = columnTypes[tnm] as ColumnType | undefined;
  if (ret == null) {
    throw new Error("typeLookup: unknown type name: '" + tnm + "'");
  }
  return ret;
};

const dbAll = tp.promisify(
  (db: sqlite3.Database, query: string, cb: (err: any, res: any) => void) =>
    db.all(query, cb)
);

interface ContextOptions {
  showQueries?: boolean;
}

export class SqliteContext implements Connection {
  dbfile: string;
  db: sqlite3.Database;
  private tableMap: TableInfoMap;
  private showQueries: boolean;

  constructor(dbfile: string, db: any, options: ContextOptions) {
    this.dbfile = dbfile;
    this.db = db;
    this.tableMap = {};
    this.showQueries =
      options != null && options.showQueries != null
        ? options.showQueries
        : false;
    if (this.showQueries) {
      log.setLevel(
        Math.min(log.getLevel(), log.levels.INFO) as log.LogLevelDesc
      );
      log.info("SqliteContext: showQueries enabled");
    }
  }

  registerTable(ti: TableInfo) {
    this.tableMap[ti.tableName] = ti;
  }

  getSchema(query: QueryExp): Schema {
    const schema = query.getSchema(SQLiteDialect, this.tableMap);
    return schema;
  }

  evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number
  ): Promise<TableRep> {
    let t0 = process.hrtime();
    const schema = query.getSchema(SQLiteDialect, this.tableMap);
    const sqlQuery = query.toSql(SQLiteDialect, this.tableMap, offset, limit);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    if (this.showQueries) {
      // log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.info("SqliteContext.evalQuery: evaluating:\n" + sqlQuery);
    }

    const t2 = process.hrtime();
    const qp = dbAll(this.db, sqlQuery);
    return qp.then((dbRows) => {
      const rows = dbRows as Row[];
      const t3 = process.hrtime(t2);
      const [t3s, t3ns] = t3;
      const t4pre = process.hrtime();
      const ret = new TableRep(schema, rows);
      const t4 = process.hrtime(t4pre);
      const [t4s, t4ns] = t4;

      /*
      if (this.showQueries) {
        log.info("time to run query: %ds %dms", t3s, t3ns / 1e6);
        log.info("time to mk table rep: %ds %dms", t4s, t4ns / 1e6);
      }
      */

      return ret;
    });
  }

  rowCount(query: QueryExp): Promise<number> {
    let t0 = process.hrtime();
    const countSql = query.toCountSql(SQLiteDialect, this.tableMap);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    if (this.showQueries) {
      // log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.rowCount: evaluating: \n" + countSql);
    }

    const t2 = process.hrtime();
    const qp = dbAll(this.db, countSql);
    return qp.then((rows) => {
      const t3 = process.hrtime(t2);
      const [t3s, t3ns] = t3;
      /*
      if (this.showQueries) {
        log.info("time to run query: %ds %dms", t3s, t3ns / 1e6);
      }
      */
      const ret = Number.parseInt(rows[0].rowCount);
      return ret;
    });
  } // use table_info pragma to construct a TableInfo:

  // Get table info directly from sqlite db
  dbGetTableInfo(tableName: string): Promise<TableInfo> {
    const tiQuery = `PRAGMA table_info(${tableName})`;
    const qp = dbAll(this.db, tiQuery);
    return qp.then((dbRows) => {
      const rows = dbRows as Row[];
      log.debug("getTableInfo: ", rows);

      const extendCMap = (
        cmm: ColumnMetaMap,
        row: any,
        idx: number
      ): ColumnMetaMap => {
        const cnm = row.name;
        const cType = row.type.toLocaleUpperCase();

        if (cType == null) {
          log.error(
            'mkTableInfo: No column type for "' + cnm + '", index: ' + idx
          );
        }
        const cmd = {
          displayName: cnm,
          columnType: cType,
        };
        cmm[cnm] = cmd;
        return cmm;
      };

      const cmMap = rows.reduce(extendCMap, {});
      const columnIds = rows.map((r) => r.name);
      const schema = new Schema(SQLiteDialect, columnIds as string[], cmMap);
      return {
        tableName,
        schema,
      };
    });
  }

  async getTableInfo(tableName: string): Promise<TableInfo> {
    let ti = this.tableMap[tableName];
    if (!ti) {
      ti = await this.dbGetTableInfo(tableName);
      if (ti) {
        this.tableMap[tableName] = ti;
      }
    }
    return ti;
  }

  async getSourceInfo(path: DataSourcePath): Promise<DataSourceNode> {
    const tiQuery = `select name,tbl_name from sqlite_master where type='table'`;
    const dbRows = await dbAll(this.db, tiQuery);
    const children: DataSourceNodeId[] = dbRows.map((row: any) => ({
      kind: "Table",
      id: row.tbl_name,
      displayName: row.name,
    }));
    let nodeId: DataSourceNodeId = {
      kind: "Database",
      id: "",
      displayName: this.dbfile,
    };
    let node: DataSourceNode = {
      nodeId,
      children,
    };
    return node;
  }
}

// A wrapper the constructor for sqlite3.Database that returns a Promise.
const open = (filename: string, mode: number): Promise<sqlite3.Database> => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, mode, (err: Error | null) => {
      if (err) {
        reject(err);
      }
      resolve(db);
    });
  });
};

const init = async (
  dbfile: string,
  options: ContextOptions = {}
): Promise<Connection> => {
  const db = await open(dbfile, sqlite3.OPEN_READWRITE);
  const ctx = new SqliteContext(dbfile, db, options);
  return ctx;
};

let ctxCache: { [key: string]: Promise<Connection> } = {};

export const getContext = (
  dbfile: string,
  options: ContextOptions = {}
): Promise<Connection> => {
  let ctxPromise: Promise<Connection> | undefined;
  const key = JSON.stringify({ dbfile, options });
  ctxPromise = ctxCache[key];
  if (!ctxPromise) {
    ctxPromise = init(dbfile, options);
    ctxCache[key] = ctxPromise;
  }

  return ctxPromise;
};
