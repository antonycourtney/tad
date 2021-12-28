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

export class FSConnection implements DataSourceConnection {
  private dbc: DuckDBContext;
  private path: string;
  private tableName: string;
  private readonly displayName: string;
  readonly sourceId: DataSourceId;

  constructor(dbc: DuckDBContext, path: string, tableName: string) {
    this.dbc = dbc;
    this.path = path;
    this.tableName = tableName;
    this.displayName = path;
    this.sourceId = { providerName: "localfs", resourceId: path };
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
    const displayName = path.basename(this.path);
    const rootNode: DataSourceNode = {
      id: this.tableName,
      kind: "Table",
      displayName,
      isContainer: false,
    };
    return rootNode;
  }
  async getChildren(path: DataSourcePath): Promise<DataSourceNode[]> {
    return [];
  }

  // Get a table name that can be used in queries:
  async getTableName(path: DataSourcePath): Promise<string> {
    return this.tableName;
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

  console.log("getting local DuckDbConnection");
  const dbc = await getDuckDbConnection();
  console.log("importing CSV");
  const tableName = await reltabDuckDB.nativeCSVImport(dbc.db, pathname);
  console.log("import complete");
  const conn = new FSConnection(dbc, pathname, tableName);
  return conn;
}

const localfsDataSourceProvider: DataSourceProvider = {
  providerName: "localfs",
  connect: async (resourceId: any): Promise<DataSourceConnection> => {
    return connectFileSource(resourceId);
  },
};

registerProvider(localfsDataSourceProvider);
