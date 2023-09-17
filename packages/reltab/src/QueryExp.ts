import { colIsString, ColumnType } from "./ColumnType";
import {
  asString,
  BinValExp,
  cast,
  col,
  ColumnExtendExp,
  constVal,
  sqlEscapeString,
  UnaryValExp,
} from "./defs";
import { SQLDialect } from "./dialect";
import { BinRelExp, FilterExp, SubExp, UnaryRelExp } from "./FilterExp";
import { queryGetSchema } from "./getSchema";
import { ppOut, StringBuffer } from "./defs";
import { ppSQLQuery } from "./pp";
import {
  AggColSpec,
  ColumnExtendOptions,
  ColumnMapInfo,
  ConcatQueryRep,
  ExtendQueryRep,
  FilterQueryRep,
  GroupByQueryRep,
  JoinQueryRep,
  JoinType,
  MapColumnsByIndexQueryRep,
  MapColumnsQueryRep,
  ProjectQueryRep,
  QueryLeafDep,
  QueryRep,
  SortQueryRep,
  SqlQueryRep,
  TableQueryRep,
} from "./QueryRep";
import { Schema } from "./Schema";
import {
  mkAggExp,
  SQLFromQuery,
  SQLQueryAST,
  SQLSelectAST,
  SQLSelectListItem,
} from "./SQLQuery";
import { Row, LeafSchemaMap, TableRep } from "./TableRep";
import { unpagedQueryToSql } from "./toSql";
import _ = require("lodash");

type QueryOp =
  | "sql"
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

export type QueryLeafDepsMap = Map<string, QueryLeafDep>;

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
    tableMap: LeafSchemaMap,
    offset?: number,
    limit?: number
  ): string {
    const sql = dialect.queryToSql(tableMap, this._rep, offset, limit);
    return ppSQLQuery(dialect, sql);
  }

  toCountSql(dialect: SQLDialect, tableMap: LeafSchemaMap): string {
    return ppSQLQuery(dialect, queryToCountSql(dialect, tableMap, this._rep));
  }

  getSchema(dialect: SQLDialect, tableMap: LeafSchemaMap): Schema {
    return queryGetSchema(dialect, tableMap, this._rep);
  }

  getLeafDeps(): QueryLeafDepsMap {
    return queryGetLeafDeps(this._rep);
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
  CastExp: (v: any) => cast(v.subExp, v.asType),
  BinValExp: (v: any) => new BinValExp(v.op, v.lhs, v.rhs),
  UnaryValExp: (v: any) => new UnaryValExp(v.op, v.arg),
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

export const deserializeQueryReq = (jsonStr: string): any => {
  const rq = JSON.parse(jsonStr, queryReviver);
  return rq;
};

export const decodeRow = (schema: Schema, row: Row): Row => {
  const outRow: Row = {};
  for (const cid in row) {
    const colType = schema.columnType(cid);
    let colVal = row[cid];
    if (colType.kind === "integer" && typeof colVal === "string") {
      colVal = BigInt(colVal);
    }
    outRow[cid] = colVal;
  }
  return outRow;
};

export const decodeTableData = (schema: Schema, rowData: Row[]): TableRep => {
  let outRows: Row[] = [];
  for (const row of rowData) {
    outRows.push(decodeRow(schema, row));
  }
  return new TableRep(schema, outRows);
};

const tableRepReviver = (key: string, val: any): any => {
  let retVal = val;

  if (val == null) {
    return null;
  }
  if (key === "schema") {
    retVal = Schema.fromJSON(val);
  }
  if (typeof val === "object") {
    if (val.type === "Buffer" && val.data instanceof Array) {
      retVal = new Uint8Array(val.data);
    }
    if (val.hasOwnProperty("schema") && val.hasOwnProperty("rowData")) {
      retVal = decodeTableData(val.schema, val.rowData);
    }
  }
  return retVal;
};

export const deserializeTableRepStr = (jsonStr: string): any => {
  const rt = JSON.parse(jsonStr, tableRepReviver);
  return rt;
};

// deserialize already decoded JSON:
export const deserializeTableRepJson = (json: any): TableRep => {
  const schemaJson = json["schema"];
  const schema = Schema.fromJSON(schemaJson);
  const tableRep = new TableRep(schema, json.rowData);
  return tableRep;
};

type GenSQLFunc = (tableMap: LeafSchemaMap, q: QueryExp) => SQLQueryAST;
type GenSQLMap = {
  [operator: string]: GenSQLFunc;
};

// Generate a count(*) as rowCount wrapper around a query:
const queryToCountSql = (
  dialect: SQLDialect,
  tableMap: LeafSchemaMap,
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

// Create base of a query expression chain by starting with a sql query:
export const sqlQuery = (sqlQuery: string): QueryExp => {
  return new QueryExp({ operator: "sql", sqlQuery });
};

const sqlQueryToJSAux = (
  dst: StringBuffer,
  depth: number,
  query: SqlQueryRep
): number => {
  ppOut(dst, depth, `sqlQuery("${query.sqlQuery}")`);
  return depth + 1;
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
      return `asString(${JSON.stringify(colExp.valExp)})`;
    case "CastExp":
      return `cast('${colExp.asType.sqlTypeName}', ${JSON.stringify(
        colExp.subExp
      )})`;
    default:
      throw new Error(
        `colExtendExptoJSStr: unknown expType in column expression ${JSON.stringify(
          colExp
        )}`
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
    case "sql":
      return sqlQueryToJSAux(dst, depth, query);
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

/*
 * To get leaf dependencies, we'll accumulate leaf dependencies into a
 * map from the JSON encoding of the QueryLeafDep to the QueryLeafDep.
 * To form a set of QueryLeafDep, we'll just build a Set of the values
 * of this map.
 */
const queryGetLeafDepsAux = (acc: QueryLeafDepsMap, query: QueryRep) => {
  switch (query.operator) {
    case "sql":
    case "table":
      const key = JSON.stringify(query);
      if (!acc.has(key)) {
        acc.set(key, query);
      }
      break;
    case "project":
    case "groupBy":
    case "filter":
    case "mapColumns":
    case "mapColumnsByIndex":
    case "sort":
    case "extend":
      queryGetLeafDepsAux(acc, query.from);
      break;
    case "concat":
      queryGetLeafDepsAux(acc, query.from);
      queryGetLeafDepsAux(acc, query.target);
      break;
    case "join":
      queryGetLeafDepsAux(acc, query.lhs);
      queryGetLeafDepsAux(acc, query.rhs);
      break;
    default:
      const invalidQuery: never = query;
      throw new Error(
        "queryGetTables: No implementation for operator, query: " + query
      );
  }
};

const queryGetLeafDeps = (query: QueryRep): QueryLeafDepsMap => {
  const deps: QueryLeafDepsMap = new Map<string, QueryLeafDep>();
  queryGetLeafDepsAux(deps, query);
  return deps;
  // const ret = new Set(deps.values());
  // return ret;
};
