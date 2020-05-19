/**
 * Definitions and interface for metadata and generation of various SQL dialects
 */

import { ColumnType, CoreColumnTypes } from "./ColumnType";

export interface SQLDialect {
  quoteCol(cid: string): string;
  ppAggNull(aggStr: string, subExpStr: string, expType: ColumnType): string;

  coreColumnTypes: CoreColumnTypes;
}
