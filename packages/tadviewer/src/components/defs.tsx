import * as reltab from "reltab";
import { Schema } from "reltab";

// Note: values here must be the field names of AppState:
export type DragItemType = "columnId";

type DragItemTypeConstMap = { [key: string]: DragItemType };
export const DragItemTypes: DragItemTypeConstMap = {
  COLUMN_ID: "columnId",
};

// Note: values here must be the field names of AppState:
export type ColumnListType = "vpivots" | "displayColumns" | "sortKey" | "aggFn";
type ColumnListTypeConstMap = { [key: string]: ColumnListType };
export const ColumnListTypes: ColumnListTypeConstMap = {
  PIVOT: "vpivots",
  DISPLAY: "displayColumns",
  SORT: "sortKey",
  AGG: "aggFn",
};

// current activity:
export type Activity =
  | "DataSource"
  | "Query"
  | "Pivot"
  | "Preferences"
  | "None";
