import {
  DuckDBConnection,
  DuckDBInstance,
  DuckDBTypeId,
  DuckDBValueConverter,
  JS,
  JSDuckDBValueConverter,
} from "@duckdb/node-api";
import * as log from "loglevel";
import {
  colIsNumeric,
  ColumnMetadata,
  ColumnMetaMap,
  ColumnStatsMap,
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

/*
 * Convert DuckDb result values to JS values.
 *
 * We use @duckdb/node-api's standard JS conversion (BIGINT -> bigint,
 * DATE/TIMESTAMP -> Date, BLOB -> Buffer, etc.), which matches what the
 * older duckdb / duckdb-async client returned, except for a few types
 * where the standard conversion yields something our renderers can't
 * display (e.g. TIME as a bigint of micros). For those we fall back to
 * DuckDb's own string rendering of the value.
 */
const tadValueConverter: DuckDBValueConverter<JS> = (
  value,
  type,
  converter
) => {
  if (value == null) {
    return null;
  }
  switch (type.typeId) {
    case DuckDBTypeId.TIME:
    case DuckDBTypeId.TIME_TZ:
    case DuckDBTypeId.TIME_NS:
    case DuckDBTypeId.INTERVAL:
    case DuckDBTypeId.MAP:
      return String(value);
    default:
      return JSDuckDBValueConverter(value, type, converter);
  }
};

/* A little ConnectionPool class because a DuckDb connection
 * only runs one query at a time.
 */
class ConnectionPool {
  db: DuckDBInstance;
  private pool: DuckDBConnection[];

  constructor(db: DuckDBInstance) {
    this.db = db;
    this.pool = [];
  }

  async take(): Promise<DuckDBConnection> {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    } else {
      const conn = await this.db.connect();
      await initS3(conn);
      return conn;
    }
  }

  giveBack(conn: DuckDBConnection) {
    this.pool.push(conn);
  }
}

/*
 * Parse SUMMARIZE's null_percentage.
 * Older DuckDb versions returned this as a VARCHAR like "12.5%";
 * newer versions return a DECIMAL (e.g. 12.5).
 */
const parsePercentage = (v: unknown): number | null => {
  if (typeof v === "number") {
    return v / 100.0;
  }
  if (typeof v === "string") {
    const ret = Number.parseFloat(v.replace(/%$/, ""));
    return Number.isNaN(ret) ? null : ret / 100.0;
  }
  return null;
};

/**
 * checkCols: check that all of the specified column names are present in the row and non-null
 */
function checkCols(row: Row, colNames: string[]): boolean {
  for (const colName of colNames) {
    if (row[colName] == null) {
      return false;
    }
  }
  return true;
}

/**
 * Take the rows from a table_info() or DESCRIBE and turn it into
 * a reltab Schema
 * @param metaRows
 */
export function schemaFromTableInfo(
  metaRows: Row[],
  columNameKey: string,
  columnTypeKey: string
): Schema {
  const extendCMap = (
    columnMetaMap: ColumnMetaMap,
    row: any,
    idx: number
  ): ColumnMetaMap => {
    const displayName = row[columNameKey];
    const columnType: string = row[columnTypeKey].toLocaleUpperCase();
    const ct = DuckDBDialect.columnTypes[columnType];
    const columnMetadata: ColumnMetadata = {
      displayName,
      columnType,
    };
    columnMetaMap[displayName] = columnMetadata;
    return columnMetaMap;
  };

  const cmMap = metaRows.reduce(extendCMap, {});
  const columnIds = metaRows.map((r) => r[columNameKey]);
  const schema = new Schema(DuckDBDialect, columnIds as string[], cmMap);
  return schema;
}

/**
 * Take the rows from a table_info() or DESCRIBE and turn it into
 * a reltab Schema
 * @param metaRows
 */
export function columnStatsFromSummarize(
  metaRows: Row[],
  columNameKey: string,
  columnTypeKey: string
): ColumnStatsMap {
  const columnStatsMap: ColumnStatsMap = {};

  for (const row of metaRows) {
    const colId = row[columNameKey] as string;
    const columnType: string = (
      row[columnTypeKey] as string
    ).toLocaleUpperCase();
    const ct = DuckDBDialect.columnTypes[columnType];
    if (
      ct &&
      colIsNumeric(ct) &&
      checkCols(row, [
        "min",
        "max",
        "approx_unique",
        "count",
        "null_percentage",
      ])
    ) {
      // numeric type!
      // annoyingly, DuckDb summarize stats returned as a (nullable!) varchar:
      const minVal = Number.parseFloat(row.min as string);
      const maxVal = Number.parseFloat(row.max as string);
      const approxUnique = Number.parseInt(row.approx_unique as string);
      const count = Number.parseInt(row.count as string);
      const pctNull = parsePercentage(row.null_percentage as string);
      const columnStats: NumericSummaryStats = {
        statsType: "numeric",
        min: minVal,
        max: maxVal,
        approxUnique,
        count,
        pctNull,
      };
      columnStatsMap[colId] = columnStats;
    }
  }
  return columnStatsMap;
}

export class DuckDBDriver implements DbDriver {
  readonly displayName: string;
  readonly sourceId: DataSourceId;
  readonly dialect: SQLDialect = DuckDBDialect;
  dbfile: string;
  db: DuckDBInstance;
  connPool: ConnectionPool;

  constructor(dbfile: string, db: DuckDBInstance, dbConn: DuckDBConnection) {
    this.dbfile = dbfile;
    this.displayName = dbfile;
    this.sourceId = { providerName: "duckdb", resourceId: dbfile };
    this.db = db;
    this.connPool = new ConnectionPool(db);
  }

  async runSqlQuery(query: string): Promise<Row[]> {
    const conn = await this.connPool.take();
    let ret: Row[];
    try {
      log.info("runSqlQuery:\n", query);
      const reader = await conn.runAndReadAll(query);
      ret = reader.convertRowObjects(tadValueConverter) as Row[];
    } finally {
      this.connPool.giveBack(conn);
    }
    return ret;
  }

  async getDisplayName(): Promise<string> {
    return this.displayName;
  }

  async getTableSchema(tableName: string): Promise<Schema> {
    return this.getSqlQuerySchema(tableName);
  }

  async getSqlQuerySchema(sqlQuery: string): Promise<Schema> {
    let descRows: Row[];
    const describeQuery = `describe ${sqlQuery}`;
    descRows = await this.runSqlQuery(describeQuery);

    const schema = schemaFromTableInfo(descRows, "column_name", "column_type");
    return schema;
  }

  async getSqlQueryColumnStatsMap(sqlQuery: string): Promise<ColumnStatsMap> {
    try {
      const summarizeQuery = `summarize ${sqlQuery}`;
      const descRows = await this.runSqlQuery(summarizeQuery);
      const columnStatsMap = columnStatsFromSummarize(
        descRows,
        "column_name",
        "column_type"
      );
      return columnStatsMap;
    } catch (err) {
      console.warn("*** summarize query failed: ", err);
      return {};
    }
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

const loadExtensions = async (db: DuckDBInstance): Promise<void> => {
  const conn = await db.connect();
  try {
    await conn.run(`INSTALL 'httpfs'; LOAD 'httpfs'`);
  } catch (err) {
    log.error("caught exception loading extensions: ", err);
    log.error("(ignoring unloadable extensions...)");
  } finally {
    conn.closeSync();
  }
};

const duckdbDataSourceProvider: DataSourceProvider = {
  providerName: "duckdb",
  connect: async (resourceId: any): Promise<DataSourceConnection> => {
    const dbfile = resourceId as string;
    const db = await DuckDBInstance.create(dbfile);
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
