/**
 * Definitions and interface for metadata and generation of various SQL dialects
 */

import { ColumnType } from "./Schema";

export interface SQLDialect {
  stringType: string; // name of the string type: "TEXT" for SQLite, "STRING" for BigQuery,...
  quoteCol(cid: string): string;
  ppAggNull(aggStr: string, subExpStr: string, expType: ColumnType): string;
}
