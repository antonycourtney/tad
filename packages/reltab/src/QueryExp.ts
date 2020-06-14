import {
  Scalar,
  sqlEscapeString,
  ColumnExtendExp,
  col,
  constVal,
  defaultDialect,
  asString,
} from "./defs";
import { FilterExp, BinRelExp, UnaryRelExp, SubExp } from "./FilterExp";
import { SQLDialect } from "./dialect";
import { ColumnType, colIsString } from "./ColumnType";
import { Schema, ColumnMetadata } from "./Schema";
import _ = require("lodash");
import { TableInfoMap, TableRep } from "./TableRep";
import { ppSQLQuery } from "./pp";
import {
  SQLQueryAST,
  mkColSelItem,
  SQLSelectAST,
  SQLSelectListItem,
  getColId,
  SQLValExp,
  SQLFromQuery,
  SQLFromJoin,
  mkAggExp,
  mkSubSelectList,
} from "./SQLQuery";
import { AggFn } from "./AggFn";
import { StringBuffer, ppOut } from "./internals";
import {
  QueryRep,
  AggColSpec,
  ColumnMapInfo,
  ColumnExtendOptions,
  JoinType,
  TableQueryRep,
  ProjectQueryRep,
  GroupByQueryRep,
  MapColumnsQueryRep,
  MapColumnsByIndexQueryRep,
  ConcatQueryRep,
  ExtendQueryRep,
  JoinQueryRep,
  FilterQueryRep,
  SortQueryRep,
} from "./QueryRep";
import { queryGetSchema } from "./getSchema";
import { pagedQueryToSql, unpagedQueryToSql } from "./toSql";

type QueryOp =
  | "table"
  | "project"
  | "filter"
  | "groupBy"
  | "mapColumns"
  | "mapColumnsByIndex"
  | "concat"
  | "sort"
  | "extend"
  | "join";

/*
 * generate a SQL literal for the given value based on its
 * column type.
 *
 * Will need work if we enrich the column type system.
 */

export const sqlLiteralVal = (ct: ColumnType, jsVal: any): string => {
  let ret;

  if (jsVal == null) {
    ret = "null";
  } else {
    ret = colIsString(ct) ? sqlEscapeString(jsVal) : jsVal.toString();
  }

  return ret;
};

// A QueryExp is the builder interface we export from reltab.
// The only things clients of the interface can do with a QueryExp are chain it
// to produce new queries, or pass it to functions like Connection.query()
export class QueryExp {
  expType: "QueryExp";
  private readonly _rep: QueryRep;

  constructor(rep: QueryRep) {
    this.expType = "QueryExp";
    this._rep = rep;
  }

  // operator chaining methods:
  project(cols: Array<string>): QueryExp {
    return new QueryExp({ operator: "project", cols, from: this._rep });
  }
  groupBy(cols: string[], aggs: AggColSpec[]): QueryExp {
    return new QueryExp({ operator: "groupBy", cols, aggs, from: this._rep });
  }

  filter(fexp: FilterExp): QueryExp {
    return new QueryExp({ operator: "filter", fexp, from: this._rep });
  }

  mapColumns(cmap: { [colName: string]: ColumnMapInfo }): QueryExp {
    return new QueryExp({ operator: "mapColumns", cmap, from: this._rep });
  }

  mapColumnsByIndex(cmap: { [colIndex: number]: ColumnMapInfo }): QueryExp {
    return new QueryExp({
      operator: "mapColumnsByIndex",
      cmap,
      from: this._rep,
    });
  }

  concat(qexp: QueryExp): QueryExp {
    return new QueryExp({
      operator: "concat",
      target: qexp._rep,
      from: this._rep,
    });
  }

  sort(keys: Array<[string, boolean]>): QueryExp {
    return new QueryExp({ operator: "sort", keys, from: this._rep });
  }

  // extend by adding a single column
  // TODO: Should probably use a distinct type from ColumnMapInfo where
  // type is mandatory:
  extend(
    colId: string,
    colExp: ColumnExtendExp,
    opts: ColumnExtendOptions = {}
  ): QueryExp {
    return new QueryExp({
      operator: "extend",
      colId,
      colExp,
      opts,
      from: this._rep,
    });
  }

  // join to another QueryExp
  join(
    rhs: QueryExp,
    on: string | Array<string>,
    joinType: JoinType = "LeftOuter"
  ): QueryExp {
    return new QueryExp({
      operator: "join",
      joinType,
      on,
      rhs: rhs._rep,
      lhs: this._rep,
    });
  }

  // distinct values of a column
  // just a degenerate groupBy:
  distinct(col: string): QueryExp {
    return this.groupBy([col], []);
  }

  toSql(
    dialect: SQLDialect,
    tableMap: TableInfoMap,
    offset?: number,
    limit?: number
  ): string {
    const sql = dialect.queryToSql(tableMap, this._rep, offset, limit);
    return ppSQLQuery(dialect, sql);
  }

  toCountSql(dialect: SQLDialect, tableMap: TableInfoMap): string {
    return ppSQLQuery(dialect, queryToCountSql(dialect, tableMap, this._rep));
  }

  getSchema(dialect: SQLDialect, tableMap: TableInfoMap): Schema {
    return queryGetSchema(dialect, tableMap, this._rep);
  }

  // render this query as a JavaScript expression:
  toJS(): string {
    let strBuf: StringBuffer = [];
    queryToJSAux(strBuf, 0, this._rep);
    const ret = strBuf.join("");
    return ret;
  }
}

const reviverMap = {
  ColRef: (v: any) => col(v.colName),
  ConstVal: (v: any) => constVal(v.val),
  AsString: (v: any) => asString(v.valExp),
  BinRelExp: (v: any) => new BinRelExp(v.op, v.lhs, v.rhs),
  UnaryRelExp: (v: any) => new UnaryRelExp(v.op, v.arg),
  FilterExp: (v: any) => new FilterExp(v.op, v.opArgs),
  QueryExp: (v: any) => new QueryExp(v._rep),
};

export const queryReviver = (key: string, val: any): any => {
  let retVal = val;

  if (val != null) {
    if (typeof val === "object") {
      const rf: (val: any) => any | undefined = (reviverMap as any)[
        val.expType
      ];

      if (rf) {
        retVal = rf(val);
      } else {
        if (val.hasOwnProperty("expType")) {
          // should probably throw...
          console.warn("*** no reviver found for expType ", val.expType);
        }
      }
    }
  }

  return retVal;
};

type QueryReq = {
  query: QueryExp;
  filterRowCount: number;
  offset?: number;
  limit?: number;
};
export const deserializeQueryReq = (jsonStr: string): QueryReq => {
  const rq = JSON.parse(jsonStr, queryReviver);
  return rq;
};

const tableRepReviver = (key: string, val: any): any => {
  let retVal = val;

  if (key === "schema") {
    retVal = Schema.fromJSON(val);
  }

  return retVal;
};

export const deserializeTableRepStr = (jsonStr: string): TableRep => {
  const rt = JSON.parse(jsonStr, tableRepReviver);
  return rt;
};

// deserialize already decoded JSON:
export const deserializeTableRepJson = (json: any): TableRep => {
  const tableRepJson = json["tableRep"];
  const schemaJson = tableRepJson["schema"];
  const schema = Schema.fromJSON(schemaJson);
  const tableRep = new TableRep(schema, tableRepJson.rowData);
  return tableRep;
};

type GenSQLFunc = (tableMap: TableInfoMap, q: QueryExp) => SQLQueryAST;
type GenSQLMap = {
  [operator: string]: GenSQLFunc;
};

// Generate a count(*) as rowCount wrapper around a query:
const queryToCountSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: QueryRep
): SQLQueryAST => {
  const sqsql = unpagedQueryToSql(dialect, tableMap, query);
  const colExp = mkAggExp("count", constVal("*"));
  const as = "rowCount";
  const selectCols: SQLSelectListItem[] = [
    {
      colExp,
      colType: dialect.coreColumnTypes.integer,
      as,
    },
  ];
  const from: SQLFromQuery = {
    expType: "query",
    query: sqsql,
  };
  const retSel: SQLSelectAST = {
    selectCols,
    from,
    groupBy: [],
    orderBy: [],
  };
  return {
    selectStmts: [retSel],
  };
};

// Create base of a query expression chain by starting with "table":
export const tableQuery = (tableName: string): QueryExp => {
  return new QueryExp({ operator: "table", tableName });
};

const tableQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: TableQueryRep
): number => {
  ppOut(dst, depth, `tableQuery("${query.tableName}")`);
  return depth + 1;
};

const projectQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: ProjectQueryRep
): number => {
  depth = queryToJSAux(dst, depth, query.from);
  dst.push("\n");
  ppOut(dst, depth, `.project(${JSON.stringify(query.cols)})`);
  return depth;
};

const aggColSpecToJS = (agg: AggColSpec): string => JSON.stringify(agg);

const groupByQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: GroupByQueryRep
): number => {
  depth = queryToJSAux(dst, depth, query.from);
  dst.push("\n");
  const aggColJSStr = `[ ${query.aggs.map(aggColSpecToJS).join(", ")} ]`;
  ppOut(dst, depth, `.groupBy(${JSON.stringify(query.cols)}, ${aggColJSStr})`);
  return depth;
};

// map to corresponding JS method name:
const jsOpMap = {
  EQ: "eq",
  NEQ: "neq",
  GT: "gt",
  GE: "ge",
  LT: "lt",
  LE: "le",
  ISNULL: "isNull",
  NOTNULL: "isNotNull",
  BEGINS: "begins",
  NOTBEGINS: "notBegins",
  ENDS: "ends",
  NOTENDS: "notEnds",
  CONTAINS: "contains",
  NOTCONTAINS: "notContains",
  IN: "in",
  NOTIN: "notIn",
};

const unaryRelExpToJSAux = (
  dst: StringBuffer,
  depth: number,
  exp: UnaryRelExp
) => {
  const opName = jsOpMap[exp.op];
  ppOut(dst, depth, `.${opName}(${colExtendExpToJSStr(exp.arg)})`);
};

const binRelExpToJSAux = (dst: StringBuffer, depth: number, exp: BinRelExp) => {
  const opName = jsOpMap[exp.op];
  ppOut(
    dst,
    depth,
    `.${opName}(${colExtendExpToJSStr(exp.lhs)}, ${colExtendExpToJSStr(
      exp.rhs
    )})`
  );
};

const subExpToJSAux = (dst: StringBuffer, depth: number, subExp: SubExp) => {
  switch (subExp.expType) {
    case "FilterExp":
      filterExpToJSAux(dst, depth, subExp);
      break;
    case "BinRelExp":
      binRelExpToJSAux(dst, depth, subExp);
      break;
    case "UnaryRelExp":
      unaryRelExpToJSAux(dst, depth, subExp);
      break;
    default:
      const foo: never = subExp;
      throw new Error(
        "subExpToJSAux: unknown expression type: " + JSON.stringify(subExp)
      );
  }
};

const filterExpToJSAux = (
  dst: StringBuffer,
  depth: number,
  fexp: FilterExp
) => {
  let opName: string = fexp.op.toLowerCase();
  ppOut(dst, depth, `${opName}()`);
  fexp.opArgs.forEach((subExp: SubExp) => {
    dst.push("\n");
    subExpToJSAux(dst, depth + 1, subExp);
  });
};

const filterQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: FilterQueryRep
): number => {
  depth = queryToJSAux(dst, depth, query.from);
  dst.push("\n");
  ppOut(dst, depth, `.filter(\n`);
  filterExpToJSAux(dst, depth + 1, query.fexp);
  dst.push(")");
  return depth;
};

const mapColumnsQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: MapColumnsQueryRep
): number => {
  depth = queryToJSAux(dst, depth, query.from);
  dst.push("\n");
  ppOut(dst, depth, `.mapColumns(${JSON.stringify(query.cmap)})`);
  return depth;
};

const mapColumnsByIndexQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: MapColumnsByIndexQueryRep
): number => {
  depth = queryToJSAux(dst, depth, query.from);
  dst.push("\n");
  ppOut(dst, depth, `.mapColumnsByIndex(${JSON.stringify(query.cmap)})`);
  return depth;
};

const concatQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: ConcatQueryRep
): number => {
  depth = queryToJSAux(dst, depth, query.from);
  dst.push("\n");
  ppOut(dst, depth, `.concat(\n`);
  queryToJSAux(dst, depth + 1, query.target);
  dst.push(")");
  return depth;
};

const sortQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: SortQueryRep
): number => {
  depth = queryToJSAux(dst, depth, query.from);
  dst.push("\n");
  ppOut(dst, depth, `.sort(${JSON.stringify(query.keys)})`);
  return depth;
};

const colExtendExpToJSStr = (colExp: ColumnExtendExp): string => {
  switch (colExp.expType) {
    case "ColRef":
      return `col("${colExp.colName}")`;
    case "ConstVal":
      return `constVal(${JSON.stringify(colExp.val)})`;
    case "AsString":
      return `asString(${colExtendExpToJSStr(colExp.valExp)})`;
    default:
      throw new Error(
        `colExtendExptoJSStr: unknown expType in column expression ${colExp}`
      );
  }
};

const extendQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: ExtendQueryRep
): number => {
  depth = queryToJSAux(dst, depth, query.from);
  dst.push("\n");
  const expJSStr = colExtendExpToJSStr(query.colExp);
  ppOut(
    dst,
    depth,
    `.extend("${query.colId}", ${expJSStr}, ${JSON.stringify(query.opts)} )`
  );
  return depth;
};

const joinQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: JoinQueryRep
): number => {
  depth = queryToJSAux(dst, depth, query.lhs);
  dst.push("\n");
  ppOut(dst, depth, `.join(\n`);
  queryToJSAux(dst, depth + 1, query.rhs);
  dst.push(",\n");
  ppOut(dst, depth + 1, `${JSON.stringify(query.on)},\n`);
  ppOut(dst, depth + 1, `${JSON.stringify(query.joinType)})`);
  return depth;
};

const queryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: QueryRep
): number => {
  switch (query.operator) {
    case "table":
      return tableQueryToJSAux(dst, depth, query);
    case "project":
      return projectQueryToJSAux(dst, depth, query);
    case "groupBy":
      return groupByQueryToJSAux(dst, depth, query);
    case "filter":
      return filterQueryToJSAux(dst, depth, query);
    case "mapColumns":
      return mapColumnsQueryToJSAux(dst, depth, query);
    case "mapColumnsByIndex":
      return mapColumnsByIndexQueryToJSAux(dst, depth, query);
    case "concat":
      return concatQueryToJSAux(dst, depth, query);
    case "sort":
      return sortQueryToJSAux(dst, depth, query);
    case "extend":
      return extendQueryToJSAux(dst, depth, query);
    case "join":
      return joinQueryToJSAux(dst, depth, query);
    default:
      const invalidQuery: never = query;
      throw new Error("queryToJSAux: No implementation for operator: " + query);
  }
};
