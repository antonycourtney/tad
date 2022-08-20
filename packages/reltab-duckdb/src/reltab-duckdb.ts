import * as tp from "typed-promisify";
import { Connection, DuckDB, IDuckDBConfig } from "ac-node-duckdb";
import * as log from "loglevel";
import {
  TableRep,
  QueryExp,
  Schema,
  TableInfoMap,
  TableInfo,
  Row,
  ColumnMetaMap,
  DataSourceConnection,
  ColumnType,
  DataSourcePath,
  DataSourceNode,
  DataSourceId,
  EvalQueryOptions,
  DataSourceProvider,
  registerProvider,
  defaultEvalQueryOptions,
  DuckDBDialect,
} from "reltab"; // eslint-disable-line
import { SQLDialect } from "reltab/dist/dialect";
import { initS3 } from "./s3utils";
import { dbAll } from "./utils";
import { QueryLeafDep, TableQueryRep } from "reltab/dist/QueryRep";

export * from "./csvimport";

const columnTypes = DuckDBDialect.columnTypes;

let viewCounter = 0;

const genViewName = (): string => `tad_tmpView_${viewCounter++}`;

const typeLookup = (tnm: string): ColumnType => {
  const ret = columnTypes[tnm] as ColumnType | undefined;
  if (ret == null) {
    throw new Error("typeLookup: unknown type name: '" + tnm + "'");
  }
  return ret;
};

/* A little ConnectionPool class because it turns out node-duckdb
 * doesn't allow concurrent queries on a connection.
 */
class ConnectionPool {
  db: DuckDB;
  private pool: Connection[];

  constructor(db: DuckDB) {
    this.db = db;
    this.pool = [];
  }

  async take(): Promise<Connection> {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    } else {
      const conn = new Connection(this.db);
      await initS3(conn);
      return conn;
    }
  }

  giveBack(conn: Connection) {
    this.pool.push(conn);
  }
}

export class DuckDBContext implements DataSourceConnection {
  readonly displayName: string;
  readonly sourceId: DataSourceId;
  dbfile: string;
  db: DuckDB;
  connPool: ConnectionPool;
  private tableMap: TableInfoMap;

  constructor(dbfile: string, db: DuckDB, dbConn: Connection) {
    this.dbfile = dbfile;
    this.displayName = dbfile;
    this.sourceId = { providerName: "duckdb", resourceId: dbfile };
    this.db = db;
    this.connPool = new ConnectionPool(db);
    this.tableMap = {};
  }

  async runSQLQuery(query: string): Promise<any> {
    const conn = await this.connPool.take();
    let ret: any;
    try {
      ret = await dbAll(conn, query);
    } finally {
      this.connPool.giveBack(conn);
    }
    return ret;
  }

  async getDisplayName(): Promise<string> {
    return this.displayName;
  }

  // ensure every table (or base query) mentioned in query is registered:
  async ensureLeafDeps(query: QueryExp): Promise<void> {
    const leafDepsMap = query.getLeafDeps();
    for (const [leafKey, leafQuery] of leafDepsMap.entries()) {
      if (this.tableMap[leafKey] === undefined) {
        await this.getLeafDepInfo(leafKey, leafQuery);
      }
    }
  }

  async getSchema(query: QueryExp): Promise<Schema> {
    await this.ensureLeafDeps(query);
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
    await this.ensureLeafDeps(query);
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
    const dbRows = await this.runSQLQuery(sqlQuery);
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
    await this.ensureLeafDeps(query);
    const countSql = query.toCountSql(DuckDBDialect, this.tableMap);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      // log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("DuckDBContext.rowCount: evaluating: \n" + countSql);
    }

    const t2 = process.hrtime();
    const qp = this.runSQLQuery(countSql);
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
  }

  async dbGetTableInfo(tableName: string): Promise<TableInfo> {
    const tiQuery = `PRAGMA table_info(${tableName})`;
    const dbRows = await this.runSQLQuery(tiQuery);
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
      schema,
    };
  }

  async dbGetSqlQueryInfo(sqlQuery: string): Promise<TableInfo> {
    const tmpViewName = genViewName();
    const mkViewQuery = `create temporary view ${tmpViewName} as ${sqlQuery}`;
    const queryRes = await this.runSQLQuery(mkViewQuery);
    // Now that we've created the temporary view, we can extract the schema the same
    // way we would for a table:
    return this.dbGetTableInfo(tmpViewName);
  }

  async getLeafDepInfo(
    leafKey: string,
    leafQuery: QueryLeafDep
  ): Promise<TableInfo> {
    let ti = this.tableMap[leafKey];
    if (!ti) {
      switch (leafQuery.operator) {
        case "table":
          ti = await this.dbGetTableInfo(leafQuery.tableName);
          break;
        case "sql":
          ti = await this.dbGetSqlQueryInfo(leafQuery.sqlQuery);
          break;
        default:
          const invalidQuery: never = leafQuery;
          throw new Error(
            "getLeafDepInfo: Unknown operator for leaf query: " + leafQuery
          );
      }
      if (ti) {
        this.tableMap[leafKey] = ti;
      }
    }
    return ti;
  }

  async getTableInfo(tableName: string): Promise<TableInfo> {
    const leafDep: TableQueryRep = { operator: "table", tableName };
    const leafKey = JSON.stringify(leafDep);
    return this.getLeafDepInfo(leafKey, leafDep);
  }

  async getRootNode(): Promise<DataSourceNode> {
    const rootNode: DataSourceNode = {
      id: this.dbfile,
      kind: "Database",
      displayName: this.dbfile,
      isContainer: true,
    };
    return rootNode;
  }
  async getChildren(dsPath: DataSourcePath): Promise<DataSourceNode[]> {
    const { path } = dsPath;
    let node: DataSourceNode;
    const tiQuery = `PRAGMA show_tables;`;
    const dbRows = await this.runSQLQuery(tiQuery);
    const tableNames: string[] = dbRows.map((row: any) => row.name);
    const childNodes: DataSourceNode[] = tableNames.map((tableName) => ({
      id: tableName,
      kind: "Table",
      displayName: tableName,
      isContainer: false,
    }));
    return childNodes;
  }

  async getTableName(dsPath: DataSourcePath): Promise<string> {
    const { path } = dsPath;
    if (path.length < 1) {
      throw new Error("getTableName: empty path");
    }
    return path[path.length - 1];
  }
}

const duckdbDataSourceProvider: DataSourceProvider = {
  providerName: "duckdb",
  connect: async (resourceId: any): Promise<DataSourceConnection> => {
    const dbfile = resourceId as string;
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

registerProvider(duckdbDataSourceProvider);
