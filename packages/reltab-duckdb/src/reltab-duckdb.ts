import { Connection, Database } from "duckdb-async";
import * as log from "loglevel";
import {
  colIsNumeric,
  ColumnMetadata,
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
  NumericSummaryStats,
  registerProvider,
  Row,
  Schema,
  SQLDialect,
  TextSummaryStats,
} from "reltab"; // eslint-disable-line
import { initS3 } from "./s3utils";

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
  db: Database;
  private pool: Connection[];

  constructor(db: Database) {
    this.db = db;
    this.pool = [];
  }

  async take(): Promise<Connection> {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    } else {
      const conn = await this.db.connect();
      await initS3(conn);
      return conn;
    }
  }

  giveBack(conn: Connection) {
    this.pool.push(conn);
  }
}

const parsePercentage = (s: string | undefined): number | null => {
  if (s != undefined && s.endsWith("%")) {
    const noPct = s.replace(/%$/, "");
    const ret = Number.parseFloat(noPct) / 100.0;
    return ret;
  }
  return null;
};

export class DuckDBDriver implements DbDriver {
  readonly displayName: string;
  readonly sourceId: DataSourceId;
  readonly dialect: SQLDialect = DuckDBDialect;
  dbfile: string;
  db: Database;
  connPool: ConnectionPool;

  constructor(dbfile: string, db: Database, dbConn: Connection) {
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
      log.info("runSqlQuery:\n", query);
      ret = await conn.all(query);
    } finally {
      this.connPool.giveBack(conn);
    }
    return ret;
  }

  async getDisplayName(): Promise<string> {
    return this.displayName;
  }

  /**
   * Take the rows from a table_info() or DESCRIBE and turn it into
   * a reltab Schema
   * @param metaRows
   */
  async schemaFromTableInfo(
    metaRows: Row[],
    columNameKey: string,
    columnTypeKey: string
  ): Promise<Schema> {
    const extendCMap = (
      columnMetaMap: ColumnMetaMap,
      row: any,
      idx: number
    ): ColumnMetaMap => {
      const displayName = row[columNameKey];
      const columnType: string = row[columnTypeKey].toLocaleUpperCase();
      const ct = DuckDBDialect.columnTypes[columnType];
      let columnStats: NumericSummaryStats | TextSummaryStats | undefined;
      if (ct && colIsNumeric(ct)) {
        // numeric type!
        // annoyingly, DuckDb summarize stats returned as varchar:
        const minVal = Number.parseFloat(row["min"]);
        const maxVal = Number.parseFloat(row["max"]);
        const approxUnique = Number.parseInt(row["approx_unique"]);
        const count = Number.parseInt(row["count"]);
        const pctNull = parsePercentage(row["null_percentage"]);
        columnStats = {
          statsType: "numeric",
          min: minVal,
          max: maxVal,
          approxUnique,
          count,
          pctNull,
        };
      }
      const columnMetadata: ColumnMetadata = {
        displayName,
        columnType,
        columnStats,
      };
      columnMetaMap[displayName] = columnMetadata;
      return columnMetaMap;
    };

    const cmMap = metaRows.reduce(extendCMap, {});
    const columnIds = metaRows.map((r) => r[columNameKey]);
    /*
    cmMap.forEach((cm, colId) => {
      const { columnType } = cm;
      const ct = DuckDBDialect.columnTypes[columnType];
      if (ct && colIsNumeric(ct)) {
      }
    }
    */
    const schema = new Schema(DuckDBDialect, columnIds as string[], cmMap);
    return schema;
  }

  async getTableSchema(tableName: string): Promise<Schema> {
    return this.getSqlQuerySchema(tableName);
  }

  async getSqlQuerySchema(sqlQuery: string): Promise<Schema> {
    const describeQuery = `summarize ${sqlQuery}`;
    const descRows = await this.runSqlQuery(describeQuery);

    const schema = await this.schemaFromTableInfo(
      descRows,
      "column_name",
      "column_type"
    );
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

const loadExtensions = async (db: Database): Promise<void> => {
  await db.exec(`INSTALL 'httpfs'; LOAD 'httpfs'`);
};

const duckdbDataSourceProvider: DataSourceProvider = {
  providerName: "duckdb",
  connect: async (resourceId: any): Promise<DataSourceConnection> => {
    const dbfile = resourceId as string;
    const db = await Database.create(dbfile);
    await loadExtensions(db);
    // turn on fast parallel CSV loading:
    // await db.exec("SET experimental_parallel_csv=true;");
    const dbConn = await db.connect();
    const driver = new DuckDBDriver(dbfile, db, dbConn);
    const dsConn = new DbDataSource(driver);
    return dsConn;
  },
};

registerProvider(duckdbDataSourceProvider);
