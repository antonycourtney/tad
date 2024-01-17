import * as log from "loglevel";
import {
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
  LeafSchemaMap,
  registerProvider,
  Row,
  Schema,
  SQLDialect,
  SQLiteDialect,
} from "reltab"; // eslint-disable-line
import * as sqlite3 from "sqlite3";
import * as tp from "typed-promisify";

export * from "./csvimport";

const columnTypes = SQLiteDialect.columnTypes;

const typeLookup = (tnm: string): ColumnType => {
  const ret = columnTypes[tnm] as ColumnType | undefined;
  if (ret == null) {
    throw new Error("typeLookup: unknown type name: '" + tnm + "'");
  }
  return ret;
};

let viewCounter = 0;

const genViewName = (): string => `tad_tmpView_${viewCounter++}`;

const dbAll = tp.promisify(
  (db: sqlite3.Database, query: string, cb: (err: any, res: any) => void) =>
    db.all(query, cb)
);

export class SqliteDriver implements DbDriver {
  readonly displayName: string;
  readonly sourceId: DataSourceId;
  readonly dialect: SQLDialect = SQLiteDialect;
  dbfile: string;
  db: sqlite3.Database;
  private tableMap: LeafSchemaMap;

  constructor(dbfile: string, db: any) {
    this.dbfile = dbfile;
    this.displayName = dbfile;
    this.sourceId = { providerName: "sqlite", resourceId: dbfile };
    this.db = db;
    this.tableMap = {};
  }

  async getDisplayName(): Promise<string> {
    return this.displayName;
  }

  async runSqlQuery(sqlQuery: string): Promise<Row[]> {
    const dbRows = await dbAll(this.db, sqlQuery);
    const rows = dbRows as Row[];
    return rows;
  }

  // Get table info directly from sqlite db
  async getTableSchema(tableName: string): Promise<Schema> {
    const tiQuery = `PRAGMA table_info(${tableName})`;
    const dbRows = await this.runSqlQuery(tiQuery);
    // log.debug("getTableSchema: ", rows);

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

    const cmMap = dbRows.reduce(extendCMap, {});
    const columnIds = dbRows.map((r) => r.name);
    const schema = new Schema(SQLiteDialect, columnIds as string[], cmMap);
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

  async getSqlQueryColumnStatsMap(sqlQuery: string): Promise<ColumnStatsMap> {
    return {};
  }

  async getRootNode(): Promise<DataSourceNode> {
    const rootNode: DataSourceNode = {
      id: "",
      kind: "Database",
      displayName: this.dbfile,
      isContainer: true,
    };
    return rootNode;
  }
  async getChildren(dsPath: DataSourcePath): Promise<DataSourceNode[]> {
    const tiQuery = `select name,tbl_name from sqlite_master where type='table'`;
    const dbRows = await dbAll(this.db, tiQuery);

    const tableNames: string[] = dbRows.map((row: any) => row.tbl_name);
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

const sqliteDataSourceProvider: DataSourceProvider = {
  providerName: "sqlite",
  connect: async (resourceId: any): Promise<DataSourceConnection> => {
    const dbfile = resourceId as string;
    const db = await open(dbfile, sqlite3.OPEN_READWRITE);
    const driver = new SqliteDriver(dbfile, db);
    const dsConn = new DbDataSource(driver);
    return dsConn;
  },
};

registerProvider(sqliteDataSourceProvider);
