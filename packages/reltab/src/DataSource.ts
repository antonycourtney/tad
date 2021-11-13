/**
 * Hierarchical organization of data sources.
 */

export type DataSourceKind = "DataSource" | "Database" | "Dataset" | "Table";

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

// metadata about the node
export interface DataSourceNodeInfo {
  kind: DataSourceKind;
  displayName: string;
  description?: string;
}

export interface DataSourceNode {
  id: string; // component of DataSourcePath.path
  nodeInfo: DataSourceNodeInfo;
  children: string[];
}
