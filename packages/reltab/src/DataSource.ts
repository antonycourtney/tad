/**
 * Hierarchical organization of data sources.
 */

import { QueryExp } from "./QueryExp";
import { TableInfo, TableRep } from "./TableRep";

export type DataSourceKind =
  | "DataSource"
  | "Database"
  | "Dataset"
  | "Table"
  | "Directory"
  | "File";

// Static registry of globally unique DataSourceProvider names:
export type DataSourceProviderName =
  | "aws-athena"
  | "bigquery"
  | "duckdb"
  | "sqlite"
  | "snowflake"
  | "localfs";

export interface DataSourceId {
  providerName: DataSourceProviderName;
  resourceId: string; // A provider-specific string to identify the data source (':memory', path to a directory or file, etc)
}

export interface DataSourcePath {
  sourceId: DataSourceId;
  path: string[];
}

export interface DataSourceNode {
  id: string; // component of DataSourcePath.path, or fully qualified name for leaf nodes
  kind: DataSourceKind;
  displayName: string;
  description?: string;
  isContainer: boolean; // true iff this node can have children
}

export interface EvalQueryOptions {
  showQueries?: boolean;
}

/**
 * A local or remote connection to a data source.
 */
export interface DataSourceConnection {
  readonly sourceId: DataSourceId;

  evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep>;
  rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number>;

  getTableInfo(tableName: string): Promise<TableInfo>;

  getRootNode(): Promise<DataSourceNode>;
  getChildren(path: DataSourcePath): Promise<DataSourceNode[]>;

  // Get a table name that can be used in queries:
  getTableName(path: DataSourcePath): Promise<string>;

  // display name for this connection
  getDisplayName(): Promise<string>;
}

export interface DataSourceProvider {
  readonly providerName: DataSourceProviderName;
  connect(resourceId: string): Promise<DataSourceConnection>;
}
