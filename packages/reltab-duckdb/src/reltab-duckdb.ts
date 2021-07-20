import * as tp from "typed-promisify";
import { Connection, DuckDB, IDuckDBConfig } from "node-duckdb";
import * as log from "loglevel";
import {
  TableRep,
  QueryExp,
  Schema,
  TableInfoMap,
  TableInfo,
  Row,
  ColumnMetaMap,
  DbConnection,
  ColumnType,
  DataSourcePath,
  DataSourceNode,
  DataSourceNodeId,
  DbConnectionKey,
  EvalQueryOptions,
  DbProvider,
  registerProvider,
  defaultEvalQueryOptions,
  DuckDBDialect,
} from "reltab"; // eslint-disable-line
import { SQLDialect } from "reltab/dist/dialect";

export * from "./csvimport";

const columnTypes = DuckDBDialect.columnTypes;

const typeLookup = (tnm: string): ColumnType => {
  const ret = columnTypes[tnm] as ColumnType | undefined;
  if (ret == null) {
    throw new Error("typeLookup: unknown type name: '" + tnm + "'");
  }
  return ret;
};


const dbAll = async (dbConn: Connection, query: string): Promise<any>  => {
  const resObj = await dbConn.executeIterator(query);
  return resObj.fetchAllRows();
};

export class DuckDBContext implements DbConnection {
  readonly displayName: string;
  readonly connectionKey: DbConnectionKey;
  dbfile: string;
  db: DuckDB;
  dbConn: Connection;
  private tableMap: TableInfoMap;

  constructor(dbfile: string, db: DuckDB, dbConn: Connection) {
    this.dbfile = dbfile;
    this.displayName = dbfile;
    this.connectionKey = { providerName: "duckdb", connectionInfo: dbfile };
    this.db = db;
    this.dbConn = dbConn;
    this.tableMap = {};
  }

  async getDisplayName(): Promise<string> {
    return this.displayName;
  }

  registerTable(ti: TableInfo) {
    this.tableMap[ti.tableName] = ti;
  }

  // ensure every table mentioned in query is registered:
  async ensureTables(query: QueryExp): Promise<void> {
    const tblNames = query.getTables();
    const namesArr = Array.from(tblNames);
    for (let tblName of namesArr) {
      if (this.tableMap[tblName] === undefined) {
        await this.getTableInfo(tblName);
      }
    }
  }

  async getSchema(query: QueryExp): Promise<Schema> {
    await this.ensureTables(query);
    const schema = query.getSchema(DuckDBDialect, this.tableMap);
    return schema;
  }

  async evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep> {
    let t0 = process.hrtime();
    await this.ensureTables(query);
    const schema = query.getSchema(DuckDBDialect, this.tableMap);
    const sqlQuery = query.toSql(DuckDBDialect, this.tableMap, offset, limit);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      // log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.info("DuckDBContext.evalQuery: evaluating:\n" + sqlQuery);
    }

    const t2 = process.hrtime();
    const dbRows = await dbAll(this.dbConn, sqlQuery);
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
  }

  async rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number> {
    let t0 = process.hrtime();
    await this.ensureTables(query);
    const countSql = query.toCountSql(DuckDBDialect, this.tableMap);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      // log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("DuckDBContext.rowCount: evaluating: \n" + countSql);
    }

    const t2 = process.hrtime();
    const qp = dbAll(this.dbConn, countSql);
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

  // Get table info directly from duckdb db
  dbGetTableInfo(tableName: string): Promise<TableInfo> {
    const tiQuery = `PRAGMA table_info(${tableName})`;
    const qp = dbAll(this.dbConn, tiQuery);
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
      const schema = new Schema(DuckDBDialect, columnIds as string[], cmMap);
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
    const tiQuery = `PRAGMA show_tables;`;
    const dbRows = await dbAll(this.dbConn, tiQuery);
    const children: DataSourceNodeId[] = dbRows.map((row: any) => ({
      kind: "Table",
      id: row.name,
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

const duckdbDbProvider: DbProvider = {
  providerName: "duckdb",
  connect: async (connectionInfo: any): Promise<DbConnection> => {
    const dbfile = connectionInfo as string;
    const dbOpts: IDuckDBConfig = {};
    if (dbfile) {
      dbOpts.path = dbfile;
    }
    const db = new DuckDB(dbOpts);
    const dbConn = new Connection(db);
    const ctx = new DuckDBContext(dbfile, db, dbConn);
    return ctx;
  },
};

registerProvider(duckdbDbProvider);
