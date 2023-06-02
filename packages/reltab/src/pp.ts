import { SQLDialect } from "./dialect";
import { asString, constVal, ColumnExtendExp } from "./defs";
import { StringBuffer, colExtendExpToSqlStr, ppOut } from "./defs";
import {
  SQLValExp,
  SQLSelectListItem,
  SQLSortColExp,
  SQLSelectAST,
  SQLQueryAST,
} from "./SQLQuery";
import { ColumnType } from "./ColumnType";

/*
 * not-so-pretty print a SQL query
 */

type PPAggFn = (
  dialect: SQLDialect,
  aggStr: string,
  subExpStr: string,
  colType: ColumnType
) => string;
const ppAggUniq = (
  dialect: SQLDialect,
  aggStr: string,
  subExpStr: string,
  colType: ColumnType
) =>
  `case when min(${subExpStr})=max(${subExpStr}) then min(${subExpStr}) else null end`;
const ppAggNull = (
  dialect: SQLDialect,
  aggStr: string,
  subExpStr: string,
  colType: ColumnType
) => dialect.ppAggNull(aggStr, subExpStr, colType);
("null");
const ppAggNullStr = (
  dialect: SQLDialect,
  aggStr: string,
  subExpStr: string,
  colType: ColumnType
) => ppValExp(dialect, asString(constVal(null)), colType);
const ppAggDefault = (
  dialect: SQLDialect,
  aggStr: string,
  subExpStr: string,
  colType: ColumnType
) => aggStr + "(" + subExpStr + ")";

const ppAggMap: { [aggStr: string]: PPAggFn } = {
  uniq: ppAggUniq,
  null: ppAggNull,
  nullstr: ppAggNullStr,
};

const getPPAggFn = (fnm: string): PPAggFn => {
  const ppfn = ppAggMap[fnm];
  return ppfn != null ? ppfn : ppAggDefault;
};

const ppValExp = (
  dialect: SQLDialect,
  vexp: SQLValExp,
  colType: ColumnType
): string => {
  let ret: string;
  switch (vexp.expType) {
    case "agg":
      const aggStr = vexp.aggFn;
      const ppAggFn = getPPAggFn(aggStr);
      ret = ppAggFn(
        dialect,
        aggStr,
        colExtendExpToSqlStr(dialect, vexp.exp),
        colType
      );
      break;
    default:
      ret = colExtendExpToSqlStr(dialect, vexp);
  }
  return ret;
};

const ppSelListItem = (
  dialect: SQLDialect,
  item: SQLSelectListItem
): string => {
  let ret: string;
  if (item.colExp == null) {
    throw new Error("ppSelListItem fail: " + item.toString());
  }
  ret = ppValExp(dialect, item.colExp, item.colType);
  if (item.as != null) {
    ret += ` as ${dialect.quoteCol(item.as)}`;
  }
  return ret;
};

const ppSortColExp = (dialect: SQLDialect, exp: SQLSortColExp): string => {
  const optDescStr = exp.asc ? "" : " desc";
  return `${dialect.quoteCol(exp.col)}${optDescStr}`;
};

let aliasCounter = 0;

const genAliasName = (): string => {
  const ret = `tableAlias_${aliasCounter++}`;
  return ret;
};

const ppSQLSelect = (
  dialect: SQLDialect,
  dst: StringBuffer,
  depth: number,
  ss: SQLSelectAST
) => {
  const selColStr = ss.selectCols
    .map((exp) => ppSelListItem(dialect, exp))
    .join(", ");
  ppOut(dst, depth, `SELECT ${selColStr}\n`);
  ppOut(dst, depth, "FROM ");
  const fromVal = ss.from;

  if (typeof fromVal === "string") {
    // Hmmm. We previously enclosed fromVal with quoteCol, but
    // this broke Snowflake when it had a fully qualified table name.
    // Let's try eliminating for now, but if we need to restore, may need
    // a special 'quoteTableName' method added to dialect....
    dst.push(fromVal + "\n");
  } else if (fromVal.expType === "join") {
    // join condition:
    const { lhs, lhsTblAlias, rhs, rhsTblAlias } = fromVal;
    dst.push("(\n");
    auxPPSQLQuery(dialect, dst, depth + 1, lhs);
    dst.push(`) ${lhsTblAlias} LEFT OUTER JOIN (\n`);
    auxPPSQLQuery(dialect, dst, depth + 1, rhs);
    dst.push(`) ${rhsTblAlias}\n`);

    if (ss.on) {
      const qcols = ss.on.map(dialect.quoteCol);
      dst.push("USING (" + qcols.join(", ") + ")\n");
    }
  } else {
    dst.push("(\n");
    auxPPSQLQuery(dialect, dst, depth + 1, fromVal.query);
    ppOut(dst, depth, ")");
    if (dialect.requireSubqueryAlias) {
      const aliasName = genAliasName();
      ppOut(dst, depth, ` AS ${aliasName}`);
    }
    ppOut(dst, depth, "\n");
  }

  if (ss.where) {
    const sqlWhereStr = ss.where.toSqlWhere(dialect);
    if (sqlWhereStr.length > 0) {
      ppOut(dst, depth, `WHERE ${sqlWhereStr}\n`);
    }
  }

  if (ss.groupBy.length > 0) {
    const gbStr = ss.groupBy.map(dialect.quoteCol).join(", ");
    ppOut(dst, depth, `GROUP BY ${gbStr}\n`);
  }

  if (ss.orderBy.length > 0) {
    const obStr = ss.orderBy
      .map((exp) => ppSortColExp(dialect, exp))
      .join(", ");
    ppOut(dst, depth, `ORDER BY ${obStr}\n`);
  }
}; // internal, recursive function:

const auxPPSQLQuery = (
  dialect: SQLDialect,
  dst: StringBuffer,
  depth: number,
  query: SQLQueryAST
) => {
  query.selectStmts.forEach((selStmt, idx) => {
    ppSQLSelect(dialect, dst, depth, selStmt);

    if (idx < query.selectStmts.length - 1) {
      ppOut(dst, depth, "UNION ALL\n");
    }
  });
  const { offset, limit } = query;
  if (limit != null) {
    ppOut(dst, 0, "LIMIT ");
    ppOut(dst, 0, limit!.toString());
  }
  if (offset != null) {
    ppOut(dst, 0, " OFFSET ");
    ppOut(dst, 0, offset.toString());
    ppOut(dst, 0, "\n");
  }
};

// external (top-level) function:
export const ppSQLQuery = (dialect: SQLDialect, query: SQLQueryAST): string => {
  try {
    let strBuf: StringBuffer = [];
    auxPPSQLQuery(dialect, strBuf, 0, query);

    const retStr = strBuf.join("");
    return retStr;
  } catch (err) {
    console.error(
      "ppSQLQuery: Caught exception pretty printing SQLQuery: ",
      err,
      JSON.stringify(query, undefined, 2)
    );

    throw err;
  }
};
