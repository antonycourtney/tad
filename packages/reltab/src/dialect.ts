/**
 * Definitions and interface for metadata and generation of various SQL dialects
 */

import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "./ColumnType";
import * as log from "loglevel";
import { TableInfoMap } from "./TableRep";
import { QueryRep } from "./QueryRep";
import { SQLQueryAST } from "./SQLQuery";

export interface SQLDialect {
  readonly dialectName: string;
  quoteCol(cid: string): string;
  ppAggNull(aggStr: string, subExpStr: string, expType: ColumnType): string;

  queryToSql(
    tableMap: TableInfoMap,
    query: QueryRep,
    offset?: number,
    limit?: number
  ): SQLQueryAST;

  readonly coreColumnTypes: CoreColumnTypes;
  columnTypes: ColumnTypeMap;
}

export const ensureDialectColumnType = (
  dialect: SQLDialect,
  colTypeName: string
): ColumnType => {
  let entry = dialect.columnTypes[colTypeName];
  if (entry == null) {
    log.debug(
      "no column type found for type name '" + colTypeName + "' -- adding entry"
    );
    entry = new ColumnType(colTypeName, "dialect");
    dialect.columnTypes[colTypeName] = entry;
  }
  return entry;
};
