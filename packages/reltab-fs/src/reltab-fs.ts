import * as log from "loglevel";
import { DuckDBContext } from "reltab-duckdb";
import * as reltabDuckDB from "reltab-duckdb";
import {
  DataSourceConnection,
  DataSourceId,
  DataSourceNode,
  DataSourcePath,
  DataSourceProvider,
  EvalQueryOptions,
  getConnection,
  QueryExp,
  registerProvider,
  TableInfo,
  TableRep,
} from "reltab";
import * as fs from "fs";
import * as path from "path";

interface ImportedFileInfo {
  baseName: string;
  tableName: string | null;
  path: string;
}

let _duckDbConn: Promise<DuckDBContext> | null;
async function getDuckDbConnection(): Promise<DuckDBContext> {
  if (!_duckDbConn) {
    let connKey: DataSourceId;

    connKey = {
      providerName: "duckdb",
      resourceId: ":memory:",
    };
    _duckDbConn = getConnection(connKey, {
      hidden: true,
      forExport: true,
    }) as Promise<DuckDBContext>;
  }
  return _duckDbConn;
}

// mapping from pathnames to imported table names:
type ImportMap = { [path: string]: string };

export class FSConnection implements DataSourceConnection {
  private dbc: DuckDBContext;
  private rootPath: string;
  private rootStats: fs.Stats;
  private importMap: ImportMap = {};
  private readonly displayName: string;
  readonly sourceId: DataSourceId;

  constructor(dbc: DuckDBContext, rootPath: string, rootStats: fs.Stats) {
    this.dbc = dbc;
    this.rootPath = rootPath;
    this.rootStats = rootStats;
    this.displayName = rootPath;
    this.sourceId = { providerName: "localfs", resourceId: rootPath };
  }

  evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep> {
    return this.dbc.evalQuery(query, offset, limit, options);
  }

  rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number> {
    return this.dbc.rowCount(query, options);
  }

  getTableInfo(tableName: string): Promise<TableInfo> {
    return this.dbc.getTableInfo(tableName);
  }

  async getRootNode(): Promise<DataSourceNode> {
    const displayName = path.basename(this.rootPath);
    const isDir = this.rootStats.isDirectory();
    const rootNode: DataSourceNode = {
      id: this.rootPath,
      kind: isDir ? "Directory" : "File",
      displayName,
      isContainer: isDir,
    };
    return rootNode;
  }
  async getChildren(dsPath: DataSourcePath): Promise<DataSourceNode[]> {
    const targetPath = path.join(...dsPath.path);
    const dirEnts = await fs.promises.readdir(targetPath, {
      withFileTypes: true,
    });
    const childNodes = dirEnts.map((ent) => {
      const isDir = ent.isDirectory();
      const node: DataSourceNode = {
        id: ent.name,
        kind: isDir ? "Directory" : "File",
        displayName: ent.name,
        isContainer: isDir,
      };
      return node;
    });
    return childNodes;
  }

  // Get a table name that can be used in queries:
  async getTableName(dsPath: DataSourcePath): Promise<string> {
    const targetPath = path.join(...dsPath.path);
    let tableName = this.importMap[targetPath];
    if (!tableName) {
      log.debug(
        "getTableName: no entry found for ",
        targetPath,
        ", importing..."
      );
      const extName = path.extname(targetPath);
      console.log("extName: ", extName);
      if (extName === ".parquet") {
        console.log("importing parquet file...");
        tableName = await reltabDuckDB.nativeParquetImport(
          this.dbc.db,
          targetPath
        );
      } else {
        tableName = await reltabDuckDB.nativeCSVImport(this.dbc.db, targetPath);
      }
      this.importMap[targetPath] = tableName;
    } else {
      log.debug(" getTableName: ", targetPath, " ---> ", tableName);
    }
    return tableName;
  }

  // display name for this connection
  async getDisplayName(): Promise<string> {
    return this.displayName;
  }
}

async function connectFileSource(
  pathname: string
): Promise<DataSourceConnection> {
  // check if pathname exists
  if (!fs.existsSync(pathname)) {
    let msg = '"' + pathname + '": file not found.';
    throw new Error(msg);
  }
  const fstats = await fs.promises.stat(pathname);

  const dbc = await getDuckDbConnection();
  const conn = new FSConnection(dbc, pathname, fstats);
  return conn;
}

const localfsDataSourceProvider: DataSourceProvider = {
  providerName: "localfs",
  connect: async (resourceId: any): Promise<DataSourceConnection> => {
    return connectFileSource(resourceId);
  },
};

registerProvider(localfsDataSourceProvider);
