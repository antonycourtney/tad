/**
 * various unpagedQueryToSql functions, for transforming reltab QueryRep trees to SQLQueryAST trees
 */

import { SQLDialect } from "./dialect";
import {
  TableQueryRep,
  ProjectQueryRep,
  GroupByQueryRep,
  FilterQueryRep,
  QueryRep,
  ConcatQueryRep,
  SortQueryRep,
  ExtendQueryRep,
  JoinQueryRep,
} from "./QueryRep";
import {
  SQLQueryAST,
  mkColSelItem,
  SQLSelectAST,
  SQLSelectListItem,
  getColId,
  SQLValExp,
  SQLFromQuery,
  mkSubSelectList,
  SQLFromJoin,
} from "./SQLQuery";
import { ppSQLQuery } from "./pp";
import { defaultDialect, col, ColumnExtendExp } from "./defs";
import _ = require("lodash");
import { AggFn } from "./AggFn";
import { TableInfoMap } from "./TableRep";
import { ColumnType, colIsString } from "./ColumnType";
import { queryGetSchema, getOrInferColumnType } from "./getSchema";

const tableQueryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { tableName }: TableQueryRep
): SQLQueryAST => {
  const schema = tableMap[tableName].schema;

  const selectCols = schema.columns;
  const sel = {
    selectCols: selectCols.map((cid) =>
      mkColSelItem(cid, schema.columnType(cid))
    ),
    from: tableName,
    groupBy: [],
    orderBy: [],
  };
  return {
    selectStmts: [sel],
  };
};

// Gather map by column id of SQLSelectListItem in a SQLSelectAST
const selectColsMap = (
  selExp: SQLSelectAST
): {
  [cid: string]: SQLSelectListItem;
} => {
  let ret: { [cid: string]: SQLSelectListItem } = {};

  for (let cexp of selExp.selectCols) {
    ret[getColId(cexp)] = cexp;
  }

  return ret;
};

const projectQueryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { cols, from }: ProjectQueryRep
): SQLQueryAST => {
  const sqsql = unpagedQueryToSql(dialect, tableMap, from);

  // rewrite an individual select statement to only select projected cols:
  const rewriteSel = (sel: SQLSelectAST): SQLSelectAST => {
    const colsMap = selectColsMap(sel);
    const outCols = cols.map((cid: string) => {
      let outCol = colsMap[cid];

      if (outCol === undefined) {
        const sqStr = ppSQLQuery(defaultDialect, sqsql);
        throw new Error(
          "projectQueryToSql: no such column " +
            defaultDialect.quoteCol(cid) +
            " in subquery:  " +
            sqStr
        );
      }

      return outCol;
    });
    return _.defaults(
      {
        selectCols: outCols,
      },
      sel
    );
  };

  return {
    selectStmts: sqsql.selectStmts.map(rewriteSel),
  };
};

export const defaultAggFn = (ct: ColumnType): AggFn => ct.defaultAggFn;

const groupByQueryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { cols, aggs, from }: GroupByQueryRep
): SQLQueryAST => {
  const inSchema = queryGetSchema(dialect, tableMap, from);

  // emulate the uniq and null aggregation functions:
  const aggExprs: SQLSelectListItem[] = aggs.map((aggSpec) => {
    let aggStr: AggFn;
    let cid;
    let colExp: SQLValExp;

    let colType: ColumnType;
    if (typeof aggSpec === "string") {
      cid = aggSpec;
      colType = inSchema.columnType(cid);
      aggStr = defaultAggFn(colType);
    } else {
      [aggStr, cid] = aggSpec;
      colType = inSchema.columnType(cid);
    }

    if (aggStr == "null") {
      if (colIsString(inSchema.columnType(cid))) {
        aggStr = "nullstr";
      }
    }

    return {
      colExp: { expType: "agg", aggFn: aggStr, exp: col(cid) },
      colType,
      as: cid,
    };
  });

  const selectGbCols: SQLSelectListItem[] = cols.map((cid) =>
    mkColSelItem(cid, inSchema.columnType(cid))
  );
  const selectCols = selectGbCols.concat(aggExprs);
  const sqsql = unpagedQueryToSql(dialect, tableMap, from);

  // If sub-query is just a single select with no group by
  // and where every select expression a simple column id
  // we can rewrite it:

  let retSel: SQLSelectAST;
  const subSel = sqsql.selectStmts[0];

  if (
    sqsql.selectStmts.length === 1 &&
    _.every(
      subSel.selectCols,
      (sc) => typeof sc.colExp === "string" && sc.as === undefined
    ) &&
    subSel.where === undefined &&
    subSel.groupBy.length === 0 &&
    subSel.orderBy.length === 0
  ) {
    retSel = _.defaults(
      {
        selectCols,
        groupBy: cols,
      },
      subSel
    );
  } else {
    const from: SQLFromQuery = {
      expType: "query",
      query: sqsql,
    };
    retSel = {
      selectCols,
      from,
      groupBy: cols,
      orderBy: [],
    };
  }

  return {
    selectStmts: [retSel],
  };
};

const filterQueryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { fexp, from }: FilterQueryRep
): SQLQueryAST => {
  const sqsql = unpagedQueryToSql(dialect, tableMap, from);

  const subSel = sqsql.selectStmts[0];
  let retSel: SQLSelectAST;
  if (
    sqsql.selectStmts.length === 1 &&
    subSel.where === undefined &&
    subSel.groupBy.length === 0
  ) {
    retSel = _.defaults(
      {
        where: fexp,
      },
      subSel
    );
  } else {
    const from: SQLFromQuery = {
      expType: "query",
      query: sqsql,
    };
    retSel = {
      selectCols: mkSubSelectList(subSel.selectCols),
      from,
      where: fexp,
      groupBy: [],
      orderBy: [],
    };
  }

  return {
    selectStmts: [retSel],
  };
};

/*
 * Note: this implements both mapColumns and mapColumsByIndex
 * Regrettably, we can't easily give this a generic type in TypeScript because
 * generic type params for map-like objects not yet supported,
 * see: https://github.com/microsoft/TypeScript/issues/12754
 * We'll just give cmap an 'any' type, grieve briefly, and move on.
 */
type MapColumnsGenQueryRep<T extends Object> = { cmap: any; from: QueryRep };
function mapColumnsQueryToSql<T extends Object>(
  dialect: SQLDialect,
  byIndex: boolean,
  tableMap: TableInfoMap,
  { cmap, from }: MapColumnsGenQueryRep<T>
): SQLQueryAST {
  const sqsql = unpagedQueryToSql(dialect, tableMap, from); // apply renaming to invididual select expression:

  const applyColRename = (
    cexp: SQLSelectListItem,
    index: number
  ): SQLSelectListItem => {
    const inCid = getColId(cexp);
    const mapKey = byIndex ? index : inCid;
    const outCid = cmap.hasOwnProperty(mapKey) ? cmap[mapKey].id : inCid;

    return {
      colExp: cexp.colExp,
      colType: cexp.colType,
      as: outCid,
    };
  };

  // rewrite an individual select statement by applying rename mapping:
  const rewriteSel = (sel: SQLSelectAST): SQLSelectAST => {
    const selectCols = sel.selectCols.map(applyColRename);
    return _.defaults(
      {
        selectCols,
      },
      sel
    );
  };

  const ret = {
    selectStmts: sqsql.selectStmts.map(rewriteSel),
  };
  return ret;
}

const concatQueryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { target, from }: ConcatQueryRep
): SQLQueryAST => {
  const sqSqls = [
    unpagedQueryToSql(dialect, tableMap, from),
    unpagedQueryToSql(dialect, tableMap, target),
  ];
  const allSelStmts = sqSqls.map((q) => q.selectStmts);
  return {
    selectStmts: _.flatten(allSelStmts),
  };
};

const sortQueryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { keys, from }: SortQueryRep
): SQLQueryAST => {
  const sqsql = unpagedQueryToSql(dialect, tableMap, from);
  const orderBy = keys.map(([col, asc]) => ({
    col,
    asc,
  }));

  // If subquery just a single select with no orderBy clause, just add one:
  const subSel = sqsql.selectStmts[0];
  let retSel: SQLSelectAST;

  if (sqsql.selectStmts.length === 1 && subSel.orderBy.length === 0) {
    retSel = _.defaults(
      {
        orderBy,
      },
      subSel
    );
  } else {
    const from: SQLFromQuery = {
      expType: "query",
      query: sqsql,
    };
    retSel = {
      selectCols: mkSubSelectList(subSel.selectCols),
      from,
      groupBy: [],
      orderBy,
    };
  }

  return {
    selectStmts: [retSel],
  };
};

const isConstExtendExp = (colExp: ColumnExtendExp): boolean => {
  switch (colExp.expType) {
    case "ConstVal":
      return true;
    case "AsString":
      return isConstExtendExp(colExp.valExp);
    case "ColRef":
      return false;
    default:
      throw new Error(
        "isConstExtendExp: unknown expType in " + JSON.stringify(colExp)
      );
  }
};

const extendQueryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { colId, opts, colExp, from }: ExtendQueryRep
): SQLQueryAST => {
  const inSchema = queryGetSchema(dialect, tableMap, from);
  const colType = getOrInferColumnType(dialect, inSchema, opts.type, colExp);
  const sqsql = unpagedQueryToSql(dialect, tableMap, from);
  const subSel = sqsql.selectStmts[0];

  // Note: We only want to extract the column ids from subquery for use at this level; we
  // want to skip any calculated expressions or aggregate functions

  const isConst = isConstExtendExp(colExp);
  let retSel: SQLSelectAST;

  if (isConst && sqsql.selectStmts.length === 1) {
    // just append our column to existing selectCols list:
    const outSel = subSel.selectCols.slice();
    outSel.push({
      colExp,
      colType,
      as: colId,
    });
    retSel = _.defaults(
      {
        selectCols: outSel,
      },
      subSel
    );
  } else {
    let selectCols: SQLSelectListItem[] = mkSubSelectList(subSel.selectCols);
    selectCols.push({
      colExp,
      colType,
      as: colId,
    });
    const from: SQLFromQuery = {
      expType: "query",
      query: sqsql,
    };
    retSel = {
      selectCols,
      from,
      groupBy: [],
      orderBy: [],
    };
  }

  return {
    selectStmts: [retSel],
  };
};

const joinQueryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: JoinQueryRep
): SQLQueryAST => {
  const { lhs, rhs, on: onArg, joinType } = query;
  const lhsSql = unpagedQueryToSql(dialect, tableMap, lhs);
  const rhsSql = unpagedQueryToSql(dialect, tableMap, rhs);
  const outSchema = queryGetSchema(dialect, tableMap, query);

  const selectCols: SQLSelectListItem[] = outSchema.columns.map((cid) =>
    mkColSelItem(cid, outSchema.columnType(cid))
  );
  const from: SQLFromJoin = {
    expType: "join",
    joinType,
    lhs: lhsSql,
    rhs: rhsSql,
  };
  const on = typeof onArg === "string" ? [onArg] : onArg;
  const retSel: SQLSelectAST = {
    selectCols,
    from,
    on,
    groupBy: [],
    orderBy: [],
  };
  return {
    selectStmts: [retSel],
  };
};

export const unpagedQueryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: QueryRep
): SQLQueryAST => {
  let ret: SQLQueryAST;
  switch (query.operator) {
    case "table":
      ret = tableQueryToSql(dialect, tableMap, query);
      break;
    case "project":
      ret = projectQueryToSql(dialect, tableMap, query);
      break;
    case "groupBy":
      ret = groupByQueryToSql(dialect, tableMap, query);
      break;
    case "filter":
      ret = filterQueryToSql(dialect, tableMap, query);
      break;
    case "mapColumns":
      ret = mapColumnsQueryToSql(dialect, false, tableMap, query);
      break;
    case "mapColumnsByIndex":
      ret = mapColumnsQueryToSql(dialect, true, tableMap, query);
      break;
    case "concat":
      ret = concatQueryToSql(dialect, tableMap, query);
      break;
    case "sort":
      ret = sortQueryToSql(dialect, tableMap, query);
      break;
    case "extend":
      ret = extendQueryToSql(dialect, tableMap, query);
      break;
    case "join":
      ret = joinQueryToSql(dialect, tableMap, query);
      break;
    default:
      const invalidQuery: never = query;
      throw new Error(
        "unpagedQueryToSql: No implementation for operator: " + query
      );
  }
  return ret;
};

export const pagedQueryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: QueryRep,
  offset?: number,
  limit?: number
): SQLQueryAST => {
  const ret = unpagedQueryToSql(dialect, tableMap, query);

  ret.offset = offset;
  ret.limit = limit;
  return ret;
};
