/*
 * Could almost use an intersection type of {id,type} & ColumnMetadata, but
 * properties are all optional here
 */

import { ColumnType } from "./ColumnType";
import { AggFn } from "./AggFn";
import { FilterExp } from "./FilterExp";
import { ColumnExtendExp } from "./defs";

// An AggColSpec is either a column name (for default aggregation based on column type
// or a pair of column name and AggFn
export type AggColSpec = string | [AggFn, string];

export type ColumnMapInfo = {
  id?: string;
  displayName?: string;
};

export type ColumnExtendOptions = {
  displayName?: string;
  type?: ColumnType;
};

export interface TableQueryRep {
  operator: "table";
  tableName: string;
}
export interface ProjectQueryRep {
  operator: "project";
  cols: string[];
  from: QueryRep;
}
export interface GroupByQueryRep {
  operator: "groupBy";
  cols: string[];
  aggs: AggColSpec[];
  from: QueryRep;
}
export interface FilterQueryRep {
  operator: "filter";
  fexp: FilterExp;
  from: QueryRep;
}
export interface MapColumnsQueryRep {
  operator: "mapColumns";
  cmap: { [colName: string]: ColumnMapInfo };
  from: QueryRep;
}
export interface MapColumnsByIndexQueryRep {
  operator: "mapColumnsByIndex";
  cmap: { [colIndex: number]: ColumnMapInfo };
  from: QueryRep;
}
export interface ConcatQueryRep {
  operator: "concat";
  target: QueryRep;
  from: QueryRep;
}
export interface SortQueryRep {
  operator: "sort";
  keys: [string, boolean][];
  from: QueryRep;
}
export interface ExtendQueryRep {
  operator: "extend";
  colId: string;
  colExp: ColumnExtendExp;
  opts: ColumnExtendOptions;
  from: QueryRep;
}
// Join types:  For now: only left outer
export type JoinType = "LeftOuter";
export interface JoinQueryRep {
  operator: "join";
  rhs: QueryRep;
  on: string | string[];
  joinType: JoinType;
  lhs: QueryRep;
}

export type QueryRep =
  | TableQueryRep
  | ProjectQueryRep
  | GroupByQueryRep
  | FilterQueryRep
  | MapColumnsQueryRep
  | MapColumnsByIndexQueryRep
  | ConcatQueryRep
  | SortQueryRep
  | ExtendQueryRep
  | JoinQueryRep;
