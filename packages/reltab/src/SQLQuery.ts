import { JoinType } from "./QueryRep";
import { ValExp, ColumnExtendExp, col } from "./defs";
import { FilterExp } from "./FilterExp";
import { AggFn } from "./AggFn";
import { ColumnType } from "./ColumnType";

/* AST for generating SQL queries */
/* internal only -- should not be re-exported from reltab */

export interface SQLAggExp {
  expType: "agg";
  aggFn: AggFn;
  exp: ValExp;
}
export const mkAggExp = (aggFn: AggFn, exp: ValExp): SQLAggExp => ({
  expType: "agg",
  aggFn,
  exp,
});

export type SQLValExp = ColumnExtendExp | SQLAggExp;

export type SQLSelectListItem = {
  colExp: SQLValExp;
  colType: ColumnType; // needed by some dialects, like BigQuery
  as?: string;
};

export const mkColSelItem = (
  cid: string,
  colType: ColumnType
): SQLSelectListItem => ({
  colExp: col(cid),
  colType,
});

export type SQLSortColExp = {
  col: string;
  asc: boolean;
};
export type SQLFromJoin = {
  expType: "join";
  joinType: JoinType;
  lhs: SQLQueryAST;
  rhs: SQLQueryAST;
};
export type SQLFromQuery = {
  expType: "query";
  query: SQLQueryAST;
};
export type SQLSelectAST = {
  selectCols: Array<SQLSelectListItem>;
  from: string | SQLFromQuery | SQLFromJoin;
  on?: Array<string>;
  where?: FilterExp;
  groupBy: Array<string>;
  orderBy: Array<SQLSortColExp>;
};
export type SQLQueryAST = {
  // all underliers combined via `union all`
  selectStmts: Array<SQLSelectAST>;
  offset?: number;
  limit?: number;
};

/**
 * get Column Id from a SQLSelectListItem -- essential when hoisting column names from
 * subquery
 * Throws if column id not explicit
 */
export const getColId = (cexp: SQLSelectListItem): string => {
  let ret: string;
  if (cexp.as != null) {
    ret = cexp.as;
  } else {
    const { colExp } = cexp;
    switch (colExp.expType) {
      case "ColRef":
        ret = colExp.colName;
        break;
      case "agg":
        ret = colExp.aggFn;
        break;
      default:
        throw new Error(
          `getColId: could not determine column id from select list item of expType ${colExp.expType}: ` +
            colExp.toString()
        );
    }
  }
  return ret;
};

/**
 * Turn a SelectListItem from a query into a SelectListItem for use by an outer query:
 */
const subSelectListItem = (cexp: SQLSelectListItem): SQLSelectListItem => {
  let cid: string;
  if (cexp.as != null) {
    cid = cexp.as;
  } else {
    const { colExp } = cexp;
    switch (colExp.expType) {
      case "ColRef":
        cid = colExp.colName;
        break;
      case "agg":
        cid = colExp.aggFn;
        break;
      default:
        throw new Error(
          `getColId: could not determine column id from select list item of expType ${colExp.expType}: ` +
            colExp.toString()
        );
    }
  }
  const ret = {
    colExp: col(cid),
    colType: cexp.colType,
  };
  return ret;
};

/*
 * We make this an explicit function to allow returning some rep of 'select *' in future:
 */
export const mkSubSelectList = (
  selectCols: SQLSelectListItem[]
): SQLSelectListItem[] => selectCols.map(subSelectListItem);
