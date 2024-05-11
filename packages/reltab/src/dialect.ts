/**
 * Definitions and interface for metadata and generation of various SQL dialects
 */

import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "./ColumnType";
import * as log from "loglevel";
import { LeafSchemaMap } from "./TableRep";
import { QueryRep } from "./QueryRep";
import { SQLQueryAST } from "./SQLQuery";

export interface SQLDialect {
  readonly dialectName: string;
  readonly requireSubqueryAlias: boolean;
  readonly allowNonConstExtend: boolean;
  quoteCol(cid: string): string;
  ppAggNull(aggStr: string, subExpStr: string, expType: ColumnType): string;

  queryToSql(
    tableMap: LeafSchemaMap,
    query: QueryRep,
    offset?: number,
    limit?: number
  ): SQLQueryAST;

  readonly coreColumnTypes: CoreColumnTypes;
  columnTypes: ColumnTypeMap;
}

// We'll special case this since it's part of the SQL standard,
// and doesn't fit naturally with the assumption of fixed data type names
const decimalRegex = /^DECIMAL\(\d{1,2},\d{1,2}\)$/;

export const ensureDialectColumnType = (
  dialect: SQLDialect,
  colTypeName: string
): ColumnType => {
  let entry = dialect.columnTypes[colTypeName];
  if (entry == null) {
    // special case for DECIMAL(x,y):
    if (decimalRegex.test(colTypeName)) {
      entry = dialect.columnTypes["DECIMAL"];
    } else {
      log.debug(
        "no column type found for type name '" +
          colTypeName +
          "' -- adding entry"
      );
      entry = new ColumnType(colTypeName, "dialect");
    }
    dialect.columnTypes[colTypeName] = entry;
  }
  return entry;
};
