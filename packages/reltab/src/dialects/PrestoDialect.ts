import { SQLDialect } from "../dialect";
import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "../ColumnType";
import * as log from "loglevel";
import { BaseSQLDialect } from "../BaseSQLDialect";
import { QueryRep } from "../QueryRep";
import {
  SQLQueryAST,
  SQLSelectListItem,
  mkSubSelectList,
  SQLFromQuery,
  SQLSelectAST,
} from "../SQLQuery";
import { pagedQueryToSql, unpagedQueryToSql } from "../toSql";
import { LeafSchemaMap } from "../TableRep";
import { FilterExp, and } from "../FilterExp";
import { col, constVal } from "../defs";

const intCT = new ColumnType("INT", "integer");
const floatCT = new ColumnType("DOUBLE", "real");
const stringCT = new ColumnType("VARCHAR", "string");
const boolCT = new ColumnType("BOOLEAN", "boolean");

const dateCT = new ColumnType("DATE", "date");
const timestampCT = new ColumnType("TIMESTAMP", "timestamp");

class PrestoDialectClass extends BaseSQLDialect {
  private static instance: PrestoDialectClass;
  readonly dialectName: string = "presto";
  readonly coreColumnTypes: CoreColumnTypes = {
    integer: intCT,
    real: floatCT,
    string: stringCT,
    boolean: boolCT,
  };

  readonly columnTypes: ColumnTypeMap = {
    INT: intCT,
    REAL: floatCT,
    STRING: stringCT,
    BOOLEAN: boolCT,
    DATE: dateCT,
    TIMESTAMP: timestampCT,
  };

  ppAggNull(aggStr: string, subExpStr: string, colType: ColumnType): string {
    return `CAST(null as ${colType.sqlTypeName})`;
  }

  queryToSql(
    tableMap: LeafSchemaMap,
    query: QueryRep,
    offset?: number,
    limit?: number
  ): SQLQueryAST {
    let ret: SQLQueryAST;
    if (offset != null && limit != null) {
      ret = rowNumberPagedQueryToSql(this, tableMap, query, offset, limit);
    } else {
      ret = unpagedQueryToSql(this, tableMap, query);
    }
    return ret;
  }

  static getInstance(): PrestoDialectClass {
    if (!PrestoDialectClass.instance) {
      PrestoDialectClass.instance = new PrestoDialectClass();
    }
    return PrestoDialectClass.instance;
  }
}

const rowNumberPagedQueryToSql = (
  dialect: SQLDialect,
  tableMap: LeafSchemaMap,
  query: QueryRep,
  offset: number,
  limit: number
): SQLQueryAST => {
  let ret: SQLQueryAST;
  const baseQuerySql = unpagedQueryToSql(dialect, tableMap, query);
  const rowNumCol = "_rn";

  // TODO: Could optimize this a bit by not constructing a subquery of baseQuerySql.selectStmts.length == 1, which will be the common case.
  // See extendQueryToSql for how...probably refactor that logic so we can use it here.
  // Add _rowNum to base query:
  const subSel = baseQuerySql.selectStmts[0];
  let baseSelectCols: SQLSelectListItem[] = mkSubSelectList(subSel.selectCols);
  let withRnSelectCols = baseSelectCols.slice();
  withRnSelectCols.push({
    colExp: { expType: "WindowExp", fn: "row_number" },
    colType: dialect.coreColumnTypes.integer,
    as: rowNumCol,
  });
  const from: SQLFromQuery = {
    expType: "query",
    query: baseQuerySql,
  };
  const withRnSelect: SQLSelectAST = {
    selectCols: withRnSelectCols,
    from,
    groupBy: [],
    orderBy: [],
  };
  const withRnSql: SQLQueryAST = {
    selectStmts: [withRnSelect],
  };

  // And construct the filter on _rn:
  const rowNumFilterExp: FilterExp = and()
    .ge(col(rowNumCol), constVal(offset + 1))
    .le(col(rowNumCol), constVal(offset + limit));
  const filteredRnSelect: SQLSelectAST = {
    selectCols: baseSelectCols,
    from: { expType: "query", query: withRnSql },
    where: rowNumFilterExp,
    groupBy: [],
    orderBy: [],
  };

  ret = {
    selectStmts: [filteredRnSelect],
  };
  return ret;
};

export const PrestoDialect = PrestoDialectClass.getInstance();
