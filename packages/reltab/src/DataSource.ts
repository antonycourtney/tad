/**
 * Hierarchical organization of data sources.
 */

export type DataSourceKind = "Database" | "Dataset" | "Table";

export interface DataSourceNodeId {
  kind: DataSourceKind;
  displayName: string;
  id: any;
}

export type DataSourcePath = Array<DataSourceNodeId>;

export interface DataSourceNode {
  nodeId: DataSourceNodeId; // provider-specific unique id
  description?: string;
  children: DataSourceNodeId[];
}
