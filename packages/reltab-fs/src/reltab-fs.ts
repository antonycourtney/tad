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

export const dataFileExtensions = ["csv", "tsv", "parquet", "csv.gz", "tsv.gz"];

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

// our own impl of path.extName that uses the first '.'
// (rather than last '.') to allow for extensions
// like '.csv.gz':
function extNameEx(path: string): string {
  const dotIndex = path.indexOf(".");
  if (dotIndex === -1) {
    return "";
  }
  const ext = path.slice(dotIndex);
  return ext;
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
      id: ".",
      kind: isDir ? "Directory" : "File",
      displayName,
      isContainer: isDir,
    };
    return rootNode;
  }
  getTargetPath(dsPath: DataSourcePath): string {
    return path.join(this.rootPath, ...dsPath.path);
  }
  async getChildren(dsPath: DataSourcePath): Promise<DataSourceNode[]> {
    const targetPath = this.getTargetPath(dsPath);
    const dirEnts = await fs.promises.readdir(targetPath, {
      withFileTypes: true,
    });
    const dataEnts = dirEnts.filter((ent) => {
      const isDir = ent.isDirectory();
      if (isDir) {
        return true;
      }
      const extName = extNameEx(ent.name);
      if (extName !== "") {
        const ext = extName.slice(1);
        const index = dataFileExtensions.findIndex((dext) => dext === ext);
        return index !== -1;
      }
      return false;
    });
    const childNodes = dataEnts.map((ent) => {
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
    const targetPath = this.getTargetPath(dsPath);
    let tableName = this.importMap[targetPath];
    if (!tableName) {
      log.debug(
        "getTableName: no entry found for ",
        targetPath,
        ", importing..."
      );
      const extName = path.extname(targetPath);
      if (extName === ".parquet") {
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
