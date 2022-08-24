import { Connection, DuckDB, IDuckDBConfig } from "ac-node-duckdb";
import * as log from "loglevel";
import {
  ColumnMetaMap,
  ColumnType,
  DataSourceConnection,
  DataSourceId,
  DataSourceNode,
  DataSourcePath,
  DataSourceProvider,
  DbDataSource,
  DbDriver,
  DuckDBDialect,
  registerProvider,
  Row,
  Schema,
  SQLDialect,
} from "reltab"; // eslint-disable-line
import { initS3 } from "./s3utils";
import { dbAll } from "./utils";

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

export class DuckDBDriver implements DbDriver {
  readonly displayName: string;
  readonly sourceId: DataSourceId;
  readonly dialect: SQLDialect = DuckDBDialect;
  dbfile: string;
  db: DuckDB;
  connPool: ConnectionPool;

  constructor(dbfile: string, db: DuckDB, dbConn: Connection) {
    this.dbfile = dbfile;
    this.displayName = dbfile;
    this.sourceId = { providerName: "duckdb", resourceId: dbfile };
    this.db = db;
    this.connPool = new ConnectionPool(db);
  }

  async runSqlQuery(query: string): Promise<Row[]> {
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

  async getTableSchema(tableName: string): Promise<Schema> {
    const tiQuery = `PRAGMA table_info(${tableName})`;
    const rows = await this.runSqlQuery(tiQuery);
    log.debug("getTableSchema: ", rows);

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
    return schema;
  }

  async getSqlQuerySchema(sqlQuery: string): Promise<Schema> {
    const tmpViewName = genViewName();
    const mkViewQuery = `create temporary view ${tmpViewName} as ${sqlQuery}`;
    const queryRes = await this.runSqlQuery(mkViewQuery);
    // Now that we've created the temporary view, we can extract the schema the same
    // way we would for a table:
    const schema = await this.getTableSchema(tmpViewName);
    // clean up after ourselves, since view was only needed to extract schema:
    const dropViewQuery = `drop view ${tmpViewName}`;
    const dropQueryRes = await this.runSqlQuery(dropViewQuery);
    return schema;
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
    const dbRows = await this.runSqlQuery(tiQuery);
    const tableNames: string[] = dbRows.map((row: Row) => row.name as string);
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
    const driver = new DuckDBDriver(dbfile, db, dbConn);
    const dsConn = new DbDataSource(driver);
    return dsConn;
  },
};

registerProvider(duckdbDataSourceProvider);
