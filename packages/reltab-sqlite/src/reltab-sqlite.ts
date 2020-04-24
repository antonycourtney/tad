import * as tp from "typed-promisify";
import * as sqlite3 from "sqlite3";
import * as log from "loglevel";
import { TableRep, QueryExp, Schema, tableQuery } from "reltab";
import {
  TableInfoMap,
  TableInfo,
  ValExp,
  Row,
  AggColSpec,
  SubExp,
  ColumnMetaMap,
  ColumnMapInfo,
  ColumnExtendVal,
  Connection,
} from "reltab"; // eslint-disable-line

export * from "./csvimport";

function assertDefined<A>(x: A | undefined | null): A {
  if (x == null) {
    throw new Error("unexpected null value");
  }

  return x;
}

const dbAll = tp.promisify((db, query, cb) => db.all(query, cb));

interface ContextOptions {
  showQueries?: boolean;
}

export class SqliteContext implements Connection {
  db: sqlite3.Database;
  tableMap: TableInfoMap;
  showQueries: boolean;

  constructor(db: any, options: ContextOptions) {
    this.db = db;
    this.tableMap = {};
    this.showQueries = options && options.showQueries;
  }

  registerTable(ti: TableInfo) {
    this.tableMap[ti.tableName] = ti;
  }

  evalQuery(
    query: QueryExp,
    offset: number = -1,
    limit: number = -1
  ): Promise<TableRep> {
    let t0 = process.hrtime();
    const schema = query.getSchema(this.tableMap);
    const sqlQuery = query.toSql(this.tableMap, offset, limit);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    if (this.showQueries) {
      log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.evalQuery: evaluating:");
      log.debug(sqlQuery);
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

      if (this.showQueries) {
        log.info("time to run query: %ds %dms", t3s, t3ns / 1e6);
        log.info("time to mk table rep: %ds %dms", t4s, t4ns / 1e6);
      }

      return ret;
    });
  }

  rowCount(query: QueryExp): Promise<number> {
    let t0 = process.hrtime();
    const countSql = query.toCountSql(this.tableMap);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    if (this.showQueries) {
      log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.evalQuery: evaluating:");
      log.debug(countSql);
    }

    const t2 = process.hrtime();
    const qp = dbAll(this.db, countSql);
    return qp.then((rows) => {
      const t3 = process.hrtime(t2);
      const [t3s, t3ns] = t3;
      log.info("time to run query: %ds %dms", t3s, t3ns / 1e6);
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
        const cType = row.type.toLocaleLowerCase();

        if (cType == null) {
          log.error(
            'mkTableInfo: No column type for "' + cnm + '", index: ' + idx
          );
        }

        const cmd = {
          displayName: cnm,
          type: assertDefined(cType),
        };
        cmm[cnm] = cmd;
        return cmm;
      };

      const cmMap = rows.reduce(extendCMap, {});
      const columnIds = rows.map((r) => r.name);
      const schema = new Schema(columnIds as string[], cmMap);
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
}

// A wrapper the constructor for sqlite3.Database that returns a Promise.
const open = (filename: string, mode: number): Promise<sqlite3.Database> => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, mode, (err: Error) => {
      if (err) {
        reject(err);
      }
      resolve(db);
    });
  });
};

const init = async (dbfile, options: Object = {}): Promise<Connection> => {
  log.setLevel(log.levels.DEBUG);
  const db = await open(dbfile, sqlite3.OPEN_READWRITE);
  const ctx = new SqliteContext(db, options);
  return ctx;
};

// get (singleton) connection to sqlite:
let ctxPromise: Promise<Connection> | undefined | null = null;
export const getContext = (
  dbfile: string,
  options: Object = {}
): Promise<Connection> => {
  console.log("getContext: ", dbfile, options);
  if (!ctxPromise) {
    ctxPromise = init(dbfile, options);
  }

  return ctxPromise;
};
