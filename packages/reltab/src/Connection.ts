import { QueryExp } from "./QueryExp";
import { TableRep, TableInfo } from "./TableRep";
import { SQLDialect } from "./dialect";
import { DataSourceNode, DataSourcePath, DataSourceNodeId } from "./DataSource";

// Static registry of globally unique DbProvider names:
export type DbProviderName = "aws-athena" | "bigquery" | "sqlite";
export interface DbConnectionKey {
  providerName: DbProviderName;
  connectionInfo: any;
}

export interface EvalQueryOptions {
  showQueries?: boolean;
}
export const defaultEvalQueryOptions: EvalQueryOptions = {
  showQueries: false,
};

/**
 * A local or remote connection to a specific database instance.
 */
export interface DbConnection {
  readonly connectionKey: DbConnectionKey;

  evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep>;
  rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number>;

  getTableInfo(tableName: string): Promise<TableInfo>;
  getSourceInfo(path: DataSourcePath): Promise<DataSourceNode>;

  getDisplayName(): Promise<string>;
}

export interface DbProvider {
  readonly providerName: DbProviderName;
  connect(connectionInfo: any): Promise<DbConnection>;
}

let providerRegistry: { [providerName: string]: DbProvider } = {};

// Called during static initialization from linked provider library
export function registerProvider(provider: DbProvider): void {
  providerRegistry[provider.providerName] = provider;
}

let instanceCache: { [key: string]: Promise<DbConnection> } = {};

let resolvedConnections: DbConnection[] = [];

/*
 * internal utility to record a DbConnection in our connection cache
 * when the initial connection promise resolves.
 */
const saveOnResolve = async (
  pconn: Promise<DbConnection>
): Promise<DbConnection> => {
  const c = await pconn;
  resolvedConnections.push(c);
  return c;
};

/**
 * Used to both populate and read from the instance cache
 *
 * @param providerName
 * @param connectionInfo
 */
export async function getConnection(
  connKey: DbConnectionKey
): Promise<DbConnection> {
  const key = JSON.stringify(connKey);
  let connPromise: Promise<DbConnection> | undefined;
  connPromise = instanceCache[key];
  if (!connPromise) {
    const { providerName, connectionInfo } = connKey;
    let provider: DbProvider | undefined = providerRegistry[providerName];

    if (!provider) {
      throw new Error(
        `getConnection: no registered DbProvider for provider name '${providerName}'`
      );
    }
    connPromise = saveOnResolve(provider.connect(connectionInfo));
    instanceCache[key] = connPromise;
  }
  return connPromise;
}

const connectionNodeId = async (
  conn: DbConnection
): Promise<DataSourceNodeId> => {
  const displayName = await conn.getDisplayName();
  const nodeId: DataSourceNodeId = {
    kind: "Database",
    displayName,
    id: conn.connectionKey,
  };
  return nodeId;
};

export async function getDataSources(): Promise<DataSourceNodeId[]> {
  const nodeIds: Promise<DataSourceNodeId>[] = resolvedConnections.map(
    connectionNodeId
  );
  return Promise.all(nodeIds);
}

/**
 * The ReltabConnection interface is the entry point for client-side access to
 * reltab via some client-specific transport mechanism.
 * The interface provides access to a set of data sources and the ability
 * to obtain a (proxy) DbConnection to those data sources.
 */
export interface ReltabConnection {
  connect(
    connectionKey: DbConnectionKey,
    displayName: string
  ): Promise<DbConnection>;

  getDataSources(): Promise<DataSourceNodeId[]>;

  /**
   * Expand an absolute DataSourcePath, rooted in an available Database.
   * @param path Absolute path to data source.
   */
  getSourceInfo(path: DataSourcePath): Promise<DataSourceNode>;
}

/**
 * server side of getSourceInfo standalone function, which operates on absolute paths.
 */
export async function getSourceInfo(
  path: DataSourcePath
): Promise<DataSourceNode> {
  if (path.length < 1) {
    throw new Error("getSourceInfo: empty path argument");
  }
  const rootNodeId = path[0];
  if (rootNodeId.kind !== "Database") {
    throw new Error(
      `getSourceInfo: Expected Database as first path component, found ${rootNodeId.kind}.\n  full path: {$path}`
    );
  }
  const dbConn = await getConnection(rootNodeId.id);
  const relPath = path.slice(1);
  const sourceInfo = dbConn.getSourceInfo(relPath);
  return sourceInfo;
}
