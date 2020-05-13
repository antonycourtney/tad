import { AggFn, JoinType } from "./QueryExp";
import { ValExp, ColumnExtendExp, col } from "./defs";
import { FilterExp } from "./FilterExp";

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
  colExp: SQLValExp; // was: AggColSpec;
  as?: string;
};

export const mkColSelItem = (cid: string): SQLSelectListItem => ({
  colExp: col(cid),
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
  selectStmts: Array<SQLSelectAST>;
}; // all underliers combined via `union all`

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
