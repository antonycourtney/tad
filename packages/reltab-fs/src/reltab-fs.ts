import * as fs from "fs";
import * as log from "loglevel";
import * as path from "path";
import * as fsPromises from "fs/promises";

import {
  DataSourceConnection,
  DataSourceId,
  DataSourceNode,
  DataSourcePath,
  DataSourceProvider,
  DbDataSource,
  DbDriver,
  DuckDBDialect,
  getConnection,
  registerProvider,
  Row,
  Schema,
  SQLDialect,
} from "reltab";
import * as reltabDuckDB from "reltab-duckdb";
import { DuckDBDriver } from "reltab-duckdb";

export const dataFileExtensions = ["csv", "tsv", "parquet", "csv.gz", "tsv.gz"];

interface ImportedFileInfo {
  baseName: string;
  tableName: string | null;
  path: string;
}

let _duckDBDriver: DuckDBDriver | null;
async function getDuckDBDriver(): Promise<DuckDBDriver> {
  if (!_duckDBDriver) {
    let connKey: DataSourceId;

    connKey = {
      providerName: "duckdb",
      resourceId: ":memory:",
    };
    const dsConn = await getConnection(connKey, {
      hidden: true,
      forExport: true,
    });
    const dbds = dsConn as DbDataSource;
    const driver = dbds.db as reltabDuckDB.DuckDBDriver;
    _duckDBDriver = driver;
  }
  return _duckDBDriver;
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

const ipfsPathPrefixes = ["s3://", "https://"];
const isIPFSPath = (pathname: string): boolean => {
  for (const prefix of ipfsPathPrefixes) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
};

interface ImportInfo {
  tableName: string; // table name used to import this table
  importModTime: Date; // mod time of the file at time of import, as returned from fs.stat()
}

// mapping from pathnames to imported table names:
type ImportMap = { [path: string]: ImportInfo };

export class FSDriver implements DbDriver {
  private dbc: DuckDBDriver;
  private rootPath: string;
  private isDir: boolean;
  private isIPFS: boolean;
  private importMap: ImportMap = {};
  private readonly displayName: string;
  readonly sourceId: DataSourceId;
  readonly dialect: SQLDialect = DuckDBDialect;

  constructor(
    dbc: DuckDBDriver,
    rootPath: string,
    isDir: boolean,
    isIPFS: boolean
  ) {
    this.dbc = dbc;
    this.rootPath = rootPath;
    this.isDir = isDir;
    this.isIPFS = isIPFS;
    this.displayName = rootPath;
    this.sourceId = { providerName: "localfs", resourceId: rootPath };
  }

  async runSqlQuery(query: string): Promise<Row[]> {
    return this.dbc.runSqlQuery(query);
  }

  getTableSchema(tableName: string): Promise<Schema> {
    return this.dbc.getTableSchema(tableName);
  }
  getSqlQuerySchema(sqlQuery: string): Promise<Schema> {
    return this.dbc.getSqlQuerySchema(sqlQuery);
  }

  async getRootNode(): Promise<DataSourceNode> {
    const displayName = path.basename(this.rootPath);
    const rootNode: DataSourceNode = {
      id: ".",
      kind: this.isDir ? "Directory" : "File",
      displayName,
      isContainer: this.isDir,
    };
    return rootNode;
  }
  getTargetPath(dsPath: DataSourcePath): string {
    return this.isIPFS
      ? this.rootPath
      : path.join(this.rootPath, ...dsPath.path);
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
    let importInfo = this.importMap[targetPath];
    if (!importInfo) {
      log.debug(
        "getTableName: no entry found for ",
        targetPath,
        ", importing..."
      );
      let tableName: string;
      const extName = path.extname(targetPath);
      if (extName === ".parquet") {
        tableName = await reltabDuckDB.nativeParquetImport(
          this.dbc.db,
          targetPath
        );
      } else {
        tableName = await reltabDuckDB.nativeCSVImport(this.dbc.db, targetPath);
      }
      const fileStats = await fsPromises.stat(targetPath);
      importInfo = {
        tableName,
        importModTime: fileStats.mtime,
      };
      this.importMap[targetPath] = importInfo;
    } else {
      log.debug(" getTableName: ", targetPath, " ---> ", importInfo.tableName);
      const fileStats = await fsPromises.stat(targetPath);
      if (fileStats.mtime > importInfo.importModTime) {
        log.debug(
          "**** detected updated file, re-importing: ",
          targetPath,
          fileStats.mtime
        );
        const extName = path.extname(targetPath);
        const tableName = importInfo.tableName;
        if (extName === ".parquet") {
          await reltabDuckDB.nativeParquetImport(
            this.dbc.db,
            targetPath,
            tableName
          );
        } else {
          await reltabDuckDB.nativeCSVImport(
            this.dbc.db,
            targetPath,
            tableName
          );
        }
        importInfo.importModTime = fileStats.mtime;
      }
    }
    return importInfo.tableName;
  }

  // display name for this connection
  async getDisplayName(): Promise<string> {
    return this.displayName;
  }
}

async function connectFileSource(
  pathname: string
): Promise<DataSourceConnection> {
  if (isIPFSPath(pathname)) {
    const dbc = await getDuckDBDriver();
    const driver = new FSDriver(dbc, pathname, false, true);
    const dsConn = new DbDataSource(driver);
    return dsConn;
  }
  // local file:
  // check if pathname exists
  if (!fs.existsSync(pathname)) {
    let msg = '"' + pathname + '": file not found.';
    throw new Error(msg);
  }
  const fstats = await fs.promises.stat(pathname);
  const isDir = fstats.isDirectory();

  const dbc = await getDuckDBDriver();
  const driver = new FSDriver(dbc, pathname, isDir, false);
  const dsConn = new DbDataSource(driver);
  return dsConn;
}

const localfsDataSourceProvider: DataSourceProvider = {
  providerName: "localfs",
  connect: async (resourceId: any): Promise<DataSourceConnection> => {
    return connectFileSource(resourceId);
  },
};

registerProvider(localfsDataSourceProvider);
