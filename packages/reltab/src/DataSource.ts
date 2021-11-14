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

export interface DataSourceNode {
  id: string; // component of DataSourcePath.path, or fully qualified name for leaf nodes
  kind: DataSourceKind;
  displayName: string;
  description?: string;
  isContainer: boolean; // true iff this node can have children
  children: string[];
}
