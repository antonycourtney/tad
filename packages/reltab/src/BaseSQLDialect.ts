import { SQLDialect } from "./dialect";
import { QueryRep } from "./QueryRep";
import { SQLQueryAST } from "./SQLQuery";
import { pagedQueryToSql } from "./toSql";
import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "./ColumnType";
import { LeafSchemaMap } from "./TableRep";

export abstract class BaseSQLDialect implements SQLDialect {
  abstract readonly dialectName: string;
  readonly requireSubqueryAlias: boolean = false;

  quoteCol(cid: string): string {
    return '"' + cid + '"';
  }

  ppAggNull(aggStr: string, subExpStr: string, expType: ColumnType): string {
    return "null";
  }

  queryToSql(
    tableMap: LeafSchemaMap,
    query: QueryRep,
    offset?: number,
    limit?: number
  ): SQLQueryAST {
    return pagedQueryToSql(this, tableMap, query, offset, limit);
  }

  abstract readonly coreColumnTypes: CoreColumnTypes;
  abstract columnTypes: ColumnTypeMap;
}
