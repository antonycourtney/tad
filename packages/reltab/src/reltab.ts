import * as _ from "lodash";
import { SQLDialect } from "./dialect";
import { BigQueryDialect } from "./dialects/BigQueryDialect";
import { SQLiteDialect } from "./dialects/SQLiteDialect";
export { BigQueryDialect, SQLiteDialect };

const defaultDialect = SQLiteDialect.getInstance();

/**
 * AST for filter expressions, consisting of a tree of
 * nested conjuncts or disjuncts, with relational expressions
 * at the leaves.
 * In Haskell ADT syntax:
 *
 * data BoolOp = AND | OR
 * data FilterExp = FilterExp {op: BoolOp, opArgs: [SubExp] }
 * data SubExp = RelSub RelExp
 *           | FilterSub FilterExp
 * data BinaryRelOp = EQ | GT | GE | LT | LE
 * data UnaryRelOp = ISNULL | ISNOTNULL
 * data RelExp = BinaryRelExp {lhs: ValRef, op: RelOp, rhs: ValRef }
 *              | UnaryRelExp {op: UnaryRelOp, arg: ValRef }
 * data ValRef = ColRef Ident   -- for now; may extend to dot-delimited path
 *             | Const Literal
 * data Literal = LitNum Number | LitStr String
 */
export type Scalar = number | string | boolean | null;

interface ConstVal {
  expType: "ConstVal";
  val: Scalar;
}
export const constVal = (val: Scalar): ConstVal => ({
  expType: "ConstVal",
  val,
});

interface ColRef {
  expType: "ColRef";
  colName: string;
}
export const col = (colName: string): ColRef => ({
  expType: "ColRef",
  colName,
});

export type ValExp = ConstVal | ColRef;

const quoteCol = (cid: string): string => `"${cid}"`;

const valExpToSqlStr = (vexp: ValExp): string => {
  let ret: string;
  switch (vexp.expType) {
    case "ConstVal":
      ret =
        vexp.val == null
          ? "null"
          : typeof vexp.val === "string"
          ? sqlEscapeString(vexp.val)
          : vexp.val.toString();
      break;
    case "ColRef":
      ret = quoteCol(vexp.colName);
      break;
    default:
      const invalid: never = vexp;
      throw new Error(`Unknown value expression expType: ${invalid}`);
  }
  return ret;
};

// A text cast operator applied to a column:
interface ColAsString {
  expType: "ColAsString";
  colRef: ColRef;
}
export const colAsString = (colRef: ColRef): ColAsString => ({
  expType: "ColAsString",
  colRef,
});

export type ColumnExtendExp = ValExp | ColAsString;

const colExtendExpToSqlStr = (
  dialect: SQLDialect,
  cexp: ColumnExtendExp
): string => {
  let ret: string;
  switch (cexp.expType) {
    case "ColAsString":
      ret = `CAST(${valExpToSqlStr(cexp.colRef)} AS ${dialect.stringType})`;
      break;
    default:
      ret = valExpToSqlStr(cexp);
  }
  return ret;
};

const escRegEx = /[\0\n\r\b\t'"\x1a]/g;
export const sqlEscapeMbString = (
  inStr: string | undefined | null
): string | undefined | null => {
  return inStr ? sqlEscapeString(inStr) : inStr;
};
export const sqlEscapeString = (inStr: string): string => {
  const outStr = inStr.replace(escRegEx, (s) => {
    switch (s) {
      case "\0":
        return "\\0";

      case "\n":
        return "\\n";

      case "\r":
        return "\\r";

      case "\b":
        return "\\b";

      case "\t":
        return "\\t";

      case "\x1a":
        return "\\Z";

      case "'":
        return "''";

      case '"':
        return '""';

      default:
        return "\\" + s;
    }
  });
  return ["'", outStr, "'"].join("");
};

const deserializeValExp = (js: any): ValExp => {
  // attempt to deal with migration from v0.9 format,
  // where the discriminator was called "expType" instead of "expType"
  // and we used classes rather than tagged unions.
  if (js.hasOwnProperty("expType")) {
    if (js.expType === "ConstVal") {
      return constVal(js.val);
    } else {
      return col(js.colName);
    }
  } else {
    // tagged union format should just serialize as itself
    return js as ValExp;
  }
};

export type BinRelOp =
  | "EQ"
  | "NEQ"
  | "GT"
  | "GE"
  | "LT"
  | "LE"
  | "BEGINS"
  | "NOTBEGINS"
  | "ENDS"
  | "NOTENDS"
  | "CONTAINS"
  | "NOTCONTAINS"
  | "IN"
  | "NOTIN";
export type UnaryRelOp = "ISNULL" | "NOTNULL";
export type RelOp = UnaryRelOp | BinRelOp;
const textOnlyBinaryOps: RelOp[] = [
  "IN",
  "NOTIN",
  "BEGINS",
  "NOTBEGINS",
  "ENDS",
  "NOTENDS",
  "CONTAINS",
  "NOTCONTAINS",
];
const textOnlyOpsSet = new Set(textOnlyBinaryOps);
const textNegBinaryOps: RelOp[] = [
  "NOTIN",
  "NOTBEGINS",
  "NOTENDS",
  "NOTCONTAINS",
];
const textNegOpsSet = new Set(textNegBinaryOps);
const commonBinaryOps: RelOp[] = ["EQ", "NEQ", "GT", "GE", "LT", "LE"];
const binaryOps = commonBinaryOps.concat(textOnlyBinaryOps);
const binaryOpsSet = new Set(binaryOps);
const unaryOps: RelOp[] = ["ISNULL", "NOTNULL"];
const unaryOpsSet = new Set(unaryOps);
const ppOpMap = {
  EQ: "=",
  NEQ: "<>",
  GT: ">",
  GE: ">=",
  LT: "<",
  LE: "<=",
  ISNULL: "is null",
  NOTNULL: "is not null",
  BEGINS: "starts with",
  NOTBEGINS: "does not start with",
  ENDS: "ends with",
  NOTENDS: "does not end with",
  CONTAINS: "contains",
  NOTCONTAINS: "does not contain",
  IN: "in...",
  NOTIN: "not in...",
};
export const opIsTextOnly = (op: RelOp): boolean => {
  return textOnlyOpsSet.has(op);
};
export const opIsUnary = (op: RelOp): boolean => {
  return unaryOpsSet.has(op);
};
export const opIsBinary = (op: RelOp): boolean => {
  return binaryOpsSet.has(op);
};
const textOps = textOnlyBinaryOps.concat(commonBinaryOps).concat(unaryOps);
const numOps = commonBinaryOps.concat(unaryOps);
export const columnTypeOps = (ct: ColumnType): Array<RelOp> => {
  if (ct === "text") {
    return textOps;
  }

  return numOps;
};
export const opDisplayName = (op: RelOp): string => {
  return ppOpMap[op];
};

const textOpToSqlWhere = (lhs: ValExp, op: BinRelOp, rhs: ValExp): string => {
  if (rhs.expType !== "ConstVal") {
    throw new Error(
      "textOpToSqlWhere: only constants supported for rhs of text ops"
    );
  }

  const negStr = textNegOpsSet.has(op) ? "NOT " : "";
  let ret;

  if (op === "IN" || op === "NOTIN") {
    const inVals: Array<string> = rhs.val as any;
    const inStr = inVals.map(sqlEscapeString).join(", ");
    ret = valExpToSqlStr(lhs) + " " + negStr + "IN (" + inStr + ")";
  } else {
    // assume match operator:
    let matchStr = "";
    const rhsStr: string = rhs.val as any;

    switch (op) {
      case "BEGINS":
      case "NOTBEGINS":
        matchStr = rhsStr + "%";
        break;

      case "NOTENDS":
        matchStr = "%" + rhsStr;
        break;

      case "CONTAINS":
      case "NOTCONTAINS":
        matchStr = "%" + rhsStr + "%";
        break;

      default:
        throw new Error("Unknown operator: " + op);
    }

    ret =
      valExpToSqlStr(lhs) + " " + negStr + "LIKE " + sqlEscapeString(matchStr);
  }

  return ret;
};

export class BinRelExp {
  expType: "BinRelExp";
  op: BinRelOp;
  lhs: ValExp;
  rhs: ValExp;

  constructor(op: BinRelOp, lhs: ValExp, rhs: ValExp) {
    this.expType = "BinRelExp";
    this.op = op;
    this.lhs = lhs;
    this.rhs = rhs;
  }

  toSqlWhere(): string {
    if (opIsTextOnly(this.op)) {
      return textOpToSqlWhere(this.lhs, this.op, this.rhs);
    }

    return (
      valExpToSqlStr(this.lhs) + ppOpMap[this.op] + valExpToSqlStr(this.rhs)
    );
  }

  lhsCol(): string {
    if (this.lhs.expType !== "ColRef") {
      throw new Error("Unexpected non-colref arg expType: " + this.lhs);
    }

    return this.lhs.colName;
  }
}
export class UnaryRelExp {
  expType: "UnaryRelExp";
  op: UnaryRelOp;
  arg: ValExp;

  constructor(op: UnaryRelOp, arg: ValExp) {
    this.expType = "UnaryRelExp";
    this.op = op;
    this.arg = arg;
  }

  toSqlWhere(): string {
    return valExpToSqlStr(this.arg) + " " + ppOpMap[this.op];
  }

  lhsCol(): string {
    if (this.arg.expType !== "ColRef") {
      throw new Error("Unexpected non-colref arg expType: " + this.arg);
    }

    return this.arg.colName;
  }
}
export type RelExp = BinRelExp | UnaryRelExp;
export type SubExp = RelExp | FilterExp;
export type BoolOp = "AND" | "OR";

const deserializeRelExp = (jsExp: any): RelExp => {
  if (jsExp.expType === "UnaryRelExp") {
    const arg = deserializeValExp(jsExp.arg);
    return new UnaryRelExp(jsExp.op, arg);
  } else {
    const lhs = deserializeValExp(jsExp.lhs);
    const rhs = deserializeValExp(jsExp.rhs);
    return new BinRelExp(jsExp.op, lhs, rhs);
  }
};

export class FilterExp {
  expType: "FilterExp";
  op: BoolOp;
  opArgs: Array<SubExp>;

  constructor(op: BoolOp = "AND", opArgs: Array<SubExp> = []) {
    this.expType = "FilterExp";
    this.op = op;
    this.opArgs = opArgs;
  }

  static deserialize(jsObj: any): FilterExp {
    const opArgs = jsObj.opArgs.map(deserializeRelExp);
    return new FilterExp(jsObj.op, opArgs);
  } // chained operator constructors for relational expressions:

  chainBinRelExp(op: BinRelOp, lhs: ValExp, rhs: ValExp): FilterExp {
    const relExp = new BinRelExp(op, lhs, rhs);
    const extOpArgs = this.opArgs.concat(relExp);
    return new FilterExp(this.op, extOpArgs);
  }

  chainUnaryRelExp(op: UnaryRelOp, arg: ValExp): FilterExp {
    const relExp = new UnaryRelExp(op, arg);
    const extOpArgs = this.opArgs.concat(relExp);
    return new FilterExp(this.op, extOpArgs);
  }

  eq(lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp("EQ", lhs, rhs);
  }

  gt(lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp("GT", lhs, rhs);
  }

  ge(lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp("GE", lhs, rhs);
  }

  lt(lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp("LT", lhs, rhs);
  }

  le(lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp("LE", lhs, rhs);
  }

  isNull(arg: ValExp): FilterExp {
    return this.chainUnaryRelExp("ISNULL", arg);
  }

  isNotNull(arg: ValExp): FilterExp {
    return this.chainUnaryRelExp("NOTNULL", arg);
  }

  contains(lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp("CONTAINS", lhs, rhs);
  }

  subExp(sub: FilterExp): FilterExp {
    const extOpArgs = this.opArgs.concat(sub);
    return new FilterExp(this.op, extOpArgs);
  }

  toSqlWhere(): string {
    const strs = this.opArgs.map((subExp) => {
      const subStr = subExp.toSqlWhere();

      if (subExp.expType === "FilterExp") {
        return "(" + subStr + ")";
      }

      return subStr;
    });
    const opStr = " " + this.op + " ";
    return strs.join(opStr);
  }
}
export const and = (): FilterExp => new FilterExp("AND");
export const or = (): FilterExp => new FilterExp("OR");
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
export type AggFn = "avg" | "count" | "min" | "max" | "sum" | "uniq" | "null";

// An AggColSpec is either a column name (for default aggregation based on column type
// or a pair of column name and AggFn
export type AggColSpec = string | [AggFn, string];
export type Row = {
  [columnId: string]: Scalar;
};

// metadata for a single column:
// TODO: date, time, datetime, URL, ...
export type ColumnType = "integer" | "real" | "text" | "boolean";
export type ColumnMetadata = {
  displayName: string;
  type: ColumnType;
};
const basicAggFns: AggFn[] = ["min", "max", "uniq", "null"];
const numericAggFns: AggFn[] = [
  "avg",
  "count",
  "min",
  "max",
  "sum",
  "uniq",
  "null",
];
export const typeIsNumeric = (ct: ColumnType): boolean => {
  return ct === "integer" || ct === "real";
};
export const aggFns = (ct: ColumnType): Array<AggFn> => {
  if (ct === "text") {
    return basicAggFns;
  }

  return numericAggFns;
};
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
    ret = ct === "text" ? sqlEscapeString(jsVal) : jsVal.toString();
  }

  return ret;
};

/*
 * Could almost use an intersection type of {id,type} & ColumnMetadata, but
 * properties are all optional here
 */

export type ColumnMapInfo = {
  id?: string;
  type?: ColumnType;
  displayName?: string;
}; // Join types:  For now: only left outer

export type JoinType = "LeftOuter";
export class QueryExp {
  expType: "QueryExp";
  operator: string;
  valArgs: Array<any>;
  tableArgs: Array<QueryExp>;

  constructor(
    operator: QueryOp,
    valArgs: Array<any>,
    tableArgs: Array<QueryExp> = []
  ) {
    this.expType = "QueryExp";
    this.operator = operator;
    this.valArgs = valArgs.slice();
    this.tableArgs = tableArgs.slice();
  } // operator chaining methods:

  project(cols: Array<string>): QueryExp {
    return new QueryExp("project", [cols], [this]);
  }
  groupBy(cols: string[], aggs: AggColSpec[]): QueryExp {
    const gbArgs: Array<any> = [cols];
    gbArgs.push(aggs);
    return new QueryExp("groupBy", gbArgs, [this]);
  }

  filter(fexp: FilterExp): QueryExp {
    return new QueryExp("filter", [fexp], [this]);
  }

  mapColumns(cmap: { [colName: string]: ColumnMapInfo }): QueryExp {
    return new QueryExp("mapColumns", [cmap], [this]);
  } // colIndex is a string here because Flow doesn't support non-string keys in object literals

  mapColumnsByIndex(cmap: { [colIndex: string]: ColumnMapInfo }): QueryExp {
    return new QueryExp("mapColumnsByIndex", [cmap], [this]);
  }

  concat(qexp: QueryExp): QueryExp {
    return new QueryExp("concat", [], [this, qexp]);
  }

  sort(keys: Array<[string, boolean]>): QueryExp {
    return new QueryExp("sort", [keys], [this]);
  } // extend by adding a single column

  extend(
    colId: string,
    columnMetadata: ColumnMapInfo,
    colVal: ColumnExtendExp
  ): QueryExp {
    return new QueryExp("extend", [colId, columnMetadata, colVal], [this]);
  } // join to another QueryExp

  join(
    qexp: QueryExp,
    on: string | Array<string>,
    joinType: JoinType = "LeftOuter"
  ): QueryExp {
    const onArg = typeof on === "string" ? [on] : on;
    return new QueryExp("join", [joinType, onArg], [this, qexp]);
  } // distinct values of a column
  // just a degenerate groupBy:

  distinct(col: string): QueryExp {
    return this.groupBy([col], []);
  }

  toSql(
    dialect: SQLDialect,
    tableMap: TableInfoMap,
    offset: number = -1,
    limit: number = -1
  ): string {
    return ppSQLQuery(dialect, queryToSql(tableMap, this), offset, limit);
  }

  toCountSql(dialect: SQLDialect, tableMap: TableInfoMap): string {
    return ppSQLQuery(dialect, queryToCountSql(tableMap, this), -1, -1);
  }

  getSchema(tableMap: TableInfoMap): Schema {
    return getQuerySchema(tableMap, this);
  }
}
const reviverMap = {
  ColRef: (v: any) => col(v.colName),
  ConstVal: (v: any) => constVal(v.val),
  BinRelExp: (v: any) => new BinRelExp(v.op, v.lhs, v.rhs),
  UnaryRelExp: (v: any) => new UnaryRelExp(v.op, v.arg),
  FilterExp: (v: any) => new FilterExp(v.op, v.opArgs),
  QueryExp: (v: any) => new QueryExp(v.operator, v.valArgs, v.tableArgs),
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
    retVal = new Schema(val.columns, val.columnMetadata);
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
  const schema = new Schema(schemaJson.columns, schemaJson.columnMetadata);
  const tableRep = new TableRep(schema, tableRepJson.rowData);
  return tableRep;
};

type GetSchemaFunc = (tableMap: TableInfoMap, query: QueryExp) => Schema;
type GetSchemaMap = {
  [operator: string]: GetSchemaFunc;
};

const tableGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  return tableMap[query.valArgs[0]].schema;
};

const projectGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const inSchema = query.tableArgs[0].getSchema(tableMap);
  const projectCols = query.valArgs[0];
  return new Schema(projectCols, _.pick(inSchema.columnMetadata, projectCols));
};

const groupByGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const [cols, aggSpecs] = query.valArgs as [string[], (string | string[])[]];
  const aggCols: Array<string> = aggSpecs.map((aggSpec: string | string[]) =>
    typeof aggSpec === "string" ? aggSpec : aggSpec[1]
  );
  const inSchema = query.tableArgs[0].getSchema(tableMap);
  const rs = new Schema(cols.concat(aggCols), inSchema.columnMetadata);
  return rs;
};

const filterGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const inSchema = query.tableArgs[0].getSchema(tableMap);
  return inSchema;
};

const mapColumnsGetSchema = (
  tableMap: TableInfoMap,
  query: QueryExp
): Schema => {
  // TODO: check that all columns are columns of original schema,
  // and that applying cmap will not violate any invariants on Schema....but need to nail down
  const cmap: {
    [colName: string]: ColumnMapInfo;
  } = query.valArgs[0];
  const inSchema: Schema = query.tableArgs[0].getSchema(tableMap);
  let outColumns = [];
  let outMetadata: { [cid: string]: ColumnMetadata } = {};

  for (let i = 0; i < inSchema.columns.length; i++) {
    let inColumnId = inSchema.columns[i];
    let inColumnInfo = inSchema.columnMetadata[inColumnId];
    let cmapColumnInfo = cmap[inColumnId];

    if (typeof cmapColumnInfo === "undefined") {
      outColumns.push(inColumnId);
      outMetadata[inColumnId] = inColumnInfo;
    } else {
      let outColumnId = cmapColumnInfo.id;

      if (typeof outColumnId === "undefined") {
        outColumnId = inColumnId;
      } // Form outColumnfInfo from inColumnInfo and all non-id keys in cmapColumnInfo:

      let outColumnInfo = JSON.parse(JSON.stringify(inColumnInfo));

      for (let key in cmapColumnInfo) {
        if (key !== "id" && cmapColumnInfo.hasOwnProperty(key)) {
          outColumnInfo[key] = (cmapColumnInfo as any)[key];
        }
      }

      outMetadata[outColumnId] = outColumnInfo;
      outColumns.push(outColumnId);
    }
  }

  const outSchema = new Schema(outColumns, outMetadata);
  return outSchema;
};

const mapColumnsByIndexGetSchema = (
  tableMap: TableInfoMap,
  query: QueryExp
): Schema => {
  // TODO: try to unify with mapColumns.  Probably means mapColumns will construct an argument to
  const cmap: {
    [colName: string]: ColumnMapInfo;
  } = query.valArgs[0];
  const inSchema: Schema = query.tableArgs[0].getSchema(tableMap);
  var outColumns = [];
  var outMetadata: { [cid: string]: ColumnMetadata } = {};

  for (var inIndex = 0; inIndex < inSchema.columns.length; inIndex++) {
    var inColumnId = inSchema.columns[inIndex];
    var inColumnInfo = inSchema.columnMetadata[inColumnId];
    var cmapColumnInfo = cmap[inIndex.toString()];

    if (typeof cmapColumnInfo === "undefined") {
      outColumns.push(inColumnId);
      outMetadata[inColumnId] = inColumnInfo;
    } else {
      var outColumnId = cmapColumnInfo.id;

      if (typeof outColumnId === "undefined") {
        outColumnId = inColumnId;
      } // Form outColumnfInfo from inColumnInfo and all non-id keys in cmapColumnInfo:

      var outColumnInfo = JSON.parse(JSON.stringify(inColumnInfo));

      for (var key in cmapColumnInfo) {
        if (key !== "id" && cmapColumnInfo.hasOwnProperty(key)) {
          outColumnInfo[key] = (cmapColumnInfo as any)[key];
        }
      }

      outMetadata[outColumnId] = outColumnInfo;
      outColumns.push(outColumnId);
    }
  }

  var outSchema = new Schema(outColumns, outMetadata);
  return outSchema;
};

const concatGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const inSchema: Schema = query.tableArgs[0].getSchema(tableMap);
  return inSchema;
};

const extendGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const [colId, columnMetadata] = query.valArgs;
  const inSchema: Schema = query.tableArgs[0].getSchema(tableMap);
  return inSchema.extend(colId, columnMetadata);
};

const joinGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const [joinType, on] = query.valArgs;
  const [lhs, rhs] = query.tableArgs;

  if (joinType !== "LeftOuter") {
    throw new Error("unsupported join type: " + joinType);
  }

  const lhsSchema = lhs.getSchema(tableMap);
  const rhsSchema = rhs.getSchema(tableMap);

  const rhsCols = _.difference(
    rhsSchema.columns,
    _.concat(on, lhsSchema.columns)
  );

  const rhsMeta = _.pick(rhsSchema.columnMetadata, rhsCols);

  const joinCols = _.concat(lhsSchema.columns, rhsCols);

  const joinMeta = _.defaults(lhsSchema.columnMetadata, rhsMeta);

  const joinSchema = new Schema(joinCols, joinMeta);
  return joinSchema;
};

const getSchemaMap: GetSchemaMap = {
  table: tableGetSchema,
  project: projectGetSchema,
  groupBy: groupByGetSchema,
  filter: filterGetSchema,
  mapColumns: mapColumnsGetSchema,
  mapColumnsByIndex: mapColumnsByIndexGetSchema,
  concat: concatGetSchema,
  sort: filterGetSchema,
  extend: extendGetSchema,
  join: joinGetSchema,
};

const getQuerySchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const gsf = getSchemaMap[query.operator];

  if (!gsf) {
    throw new Error(
      "getQuerySchema: No implementation for operator '" + query.operator + "'"
    );
  }

  return gsf(tableMap, query);
};
/*
 * Note: If query generation become a performance bottleneck, we
 * should ditch the string return value and instead return
 * arrays of strings for a flatmap'ed strjoin
 */

/* AST for generating SQL queries */

interface SQLAggExp {
  expType: "agg";
  aggFn: AggFn;
  exp: ValExp;
}
const mkAggExp = (aggFn: AggFn, exp: ValExp): SQLAggExp => ({
  expType: "agg",
  aggFn,
  exp,
});

type SQLValExp = ColumnExtendExp | SQLAggExp;

type SQLSelectListItem = {
  colExp: SQLValExp; // was: AggColSpec;
  as?: string;
};

const mkColSelItem = (cid: string): SQLSelectListItem => ({
  colExp: col(cid),
});

type SQLSortColExp = {
  col: string;
  asc: boolean;
};
type SQLFromJoin = {
  expType: "join";
  joinType: JoinType;
  lhs: SQLQueryAST;
  rhs: SQLQueryAST;
};
type SQLFromQuery = {
  expType: "query";
  query: SQLQueryAST;
};
type SQLSelectAST = {
  selectCols: Array<SQLSelectListItem>;
  from: string | SQLFromQuery | SQLFromJoin;
  on?: Array<string>;
  where: string;
  groupBy: Array<string>;
  orderBy: Array<SQLSortColExp>;
};
type SQLQueryAST = {
  selectStmts: Array<SQLSelectAST>;
}; // all underliers combined via `union all`

/* An array of strings that will be joined with Array.join('') to
 * form a final result string
 */

type StringBuffer = Array<string>;
/**
 * get Column Id from a SQLSelectListItem -- essential when hoisting column names from
 * subquery
 * Throws if column id not explicit
 */
const getColId = (cexp: SQLSelectListItem): string => {
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
/*
 * not-so-pretty print a SQL query
 */
const ppOut = (dst: StringBuffer, depth: number, str: string): void => {
  const indentStr = "  ".repeat(depth);
  dst.push(indentStr);
  dst.push(str);
};

const genUniq = (aggStr: string, qcid: string) =>
  `case when min(${qcid})=max(${qcid}) then min(${qcid}) else null end`;
const genNull = (aggStr: string, qcid: string) => "null";
const genAgg = (aggStr: string, qcid: string) => aggStr + "(" + qcid + ")";

const ppValExp = (dialect: SQLDialect, vexp: SQLValExp): string => {
  let ret: string;
  switch (vexp.expType) {
    case "agg":
      const aggStr = vexp.aggFn;
      const aggFn =
        aggStr === "uniq" ? genUniq : aggStr === "null" ? genNull : genAgg;
      ret = aggFn(aggStr, colExtendExpToSqlStr(dialect, vexp.exp));
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
  ret = ppValExp(dialect, item.colExp);
  if (item.as != null) {
    ret += ` as ${quoteCol(item.as)}`;
  }
  return ret;
};

const ppSortColExp = (dialect: SQLDialect, exp: SQLSortColExp): string => {
  const optDescStr = exp.asc ? "" : " desc";
  return `${quoteCol(exp.col)}${optDescStr}`;
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
    dst.push(quoteCol(fromVal) + "\n");
  } else if (fromVal.expType === "join") {
    // join condition:
    const { lhs, rhs } = fromVal;
    dst.push("(\n");
    auxPPSQLQuery(dialect, dst, depth + 1, lhs);
    dst.push(") LEFT OUTER JOIN (\n");
    auxPPSQLQuery(dialect, dst, depth + 1, rhs);
    dst.push(")\n");

    if (ss.on) {
      const qcols = ss.on.map(quoteCol);
      dst.push("USING (" + qcols.join(", ") + ")\n");
    }
  } else {
    dst.push("(\n");
    auxPPSQLQuery(dialect, dst, depth + 1, fromVal.query);
    ppOut(dst, depth, ")\n");
  }

  if (ss.where.length > 0) {
    ppOut(dst, depth, `WHERE ${ss.where}\n`);
  }

  if (ss.groupBy.length > 0) {
    const gbStr = ss.groupBy.map(quoteCol).join(", ");
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
}; // external (top-level) function:

const ppSQLQuery = (
  dialect: SQLDialect,
  query: SQLQueryAST,
  offset: number,
  limit: number
): string => {
  let strBuf: StringBuffer = [];
  auxPPSQLQuery(dialect, strBuf, 0, query);

  if (offset !== -1) {
    ppOut(strBuf, 0, "LIMIT ");
    ppOut(strBuf, 0, limit.toString());
    ppOut(strBuf, 0, " OFFSET ");
    ppOut(strBuf, 0, offset.toString());
    ppOut(strBuf, 0, "\n");
  }

  const retStr = strBuf.join("");
  return retStr;
};

type GenSQLFunc = (tableMap: TableInfoMap, q: QueryExp) => SQLQueryAST;
type GenSQLMap = {
  [operator: string]: GenSQLFunc;
};

const tableQueryToSql = (tableMap: TableInfoMap, tq: QueryExp): SQLQueryAST => {
  const tableName = tq.valArgs[0];
  const schema = tableMap[tableName].schema; // apparent Flow bug request Array<any> here:

  const selectCols = schema.columns;
  const sel = {
    selectCols: selectCols.map(mkColSelItem),
    from: tableName,
    where: "",
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
  tableMap: TableInfoMap,
  pq: QueryExp
): SQLQueryAST => {
  const projectCols: string[] = pq.valArgs[0];
  const sqsql = queryToSql(tableMap, pq.tableArgs[0]);

  // rewrite an individual select statement to only select projected cols:
  const rewriteSel = (sel: SQLSelectAST): SQLSelectAST => {
    const colsMap = selectColsMap(sel);
    const outCols = projectCols.map((cid: string) => {
      let outCol = colsMap[cid];

      if (outCol === undefined) {
        const sqStr = ppSQLQuery(defaultDialect, sqsql, -1, -1);
        throw new Error(
          "projectQueryToSql: no such column " +
            quoteCol(cid) +
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

const defaultAggs: { [CT in ColumnType]: AggFn } = {
  integer: "sum",
  real: "sum",
  text: "uniq",
  boolean: "uniq",
};

export const defaultAggFn = (colType: ColumnType): AggFn =>
  defaultAggs[colType];

const groupByQueryToSql = (
  tableMap: TableInfoMap,
  query: QueryExp
): SQLQueryAST => {
  const cols: string[] = query.valArgs[0];
  const aggSpecs: AggColSpec[] = query.valArgs[1];
  const inSchema = query.tableArgs[0].getSchema(tableMap);

  // emulate the uniq and null aggregation functions:
  const aggExprs: SQLSelectListItem[] = aggSpecs.map((aggSpec) => {
    let aggStr: AggFn;
    let cid;
    let colExp: SQLValExp;

    if (typeof aggSpec === "string") {
      cid = aggSpec;
      const colType = inSchema.columnType(cid);
      aggStr = defaultAggs[colType];
    } else {
      [aggStr, cid] = aggSpec;
    }

    return {
      colExp: { expType: "agg", aggFn: aggStr, exp: col(cid) },
      as: cid,
    };
  });

  const selectGbCols: SQLSelectListItem[] = cols.map(mkColSelItem);
  const selectCols = selectGbCols.concat(aggExprs);
  const sqsql = queryToSql(tableMap, query.tableArgs[0]);

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
    subSel.where.length === 0 &&
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
      where: "",
      orderBy: [],
    };
  }

  return {
    selectStmts: [retSel],
  };
};

const filterQueryToSql = (
  tableMap: TableInfoMap,
  query: QueryExp
): SQLQueryAST => {
  const fexp: FilterExp = query.valArgs[0];
  const sqsql = queryToSql(tableMap, query.tableArgs[0]);
  const whereStr = fexp.toSqlWhere(); // If subquery just a single select with no where or groupBy clause, just add one:

  const subSel = sqsql.selectStmts[0];
  let retSel: SQLSelectAST;

  if (
    sqsql.selectStmts.length === 1 &&
    subSel.where.length === 0 &&
    subSel.groupBy.length === 0
  ) {
    retSel = _.defaults(
      {
        where: whereStr,
      },
      subSel
    );
  } else {
    const selectCols = subSel.selectCols.map(getColId);
    const from: SQLFromQuery = {
      expType: "query",
      query: sqsql,
    };
    retSel = {
      selectCols: selectCols.map(mkColSelItem),
      from,
      where: whereStr,
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
 */

const mapColumnsQueryToSql = (byIndex: boolean) => (
  tableMap: TableInfoMap,
  query: QueryExp
): SQLQueryAST => {
  const cMap = query.valArgs[0];
  const sqsql = queryToSql(tableMap, query.tableArgs[0]); // apply renaming to invididual select expression:

  const applyColRename = (
    cexp: SQLSelectListItem,
    index: number
  ): SQLSelectListItem => {
    const inCid = getColId(cexp);
    const mapKey = byIndex ? index.toString() : inCid;
    const outCid = cMap.hasOwnProperty(mapKey) ? cMap[mapKey].id : inCid;

    return {
      colExp: cexp.colExp,
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
};

const concatQueryToSql = (
  tableMap: TableInfoMap,
  query: QueryExp
): SQLQueryAST => {
  const sqSqls = query.tableArgs.map((tq) => queryToSql(tableMap, tq));
  const allSelStmts = sqSqls.map((q) => q.selectStmts);
  return {
    selectStmts: _.flatten(allSelStmts),
  };
};

const sortQueryToSql = (
  tableMap: TableInfoMap,
  query: QueryExp
): SQLQueryAST => {
  const sqsql = queryToSql(tableMap, query.tableArgs[0]);
  const orderBy = (query.valArgs[0] as [string, boolean][]).map(
    ([col, asc]) => ({
      col,
      asc,
    })
  ); // If subquery just a single select with no orderBy clause, just add one:

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
    let selectCols = subSel.selectCols.map(getColId);
    const from: SQLFromQuery = {
      expType: "query",
      query: sqsql,
    };
    retSel = {
      selectCols: selectCols.map(mkColSelItem),
      from,
      where: "",
      groupBy: [],
      orderBy,
    };
  }

  return {
    selectStmts: [retSel],
  };
};

/*
const intRE = /^[-+]?[$]?[0-9,]+$/
const strLitRE = /^'[^']*'$/
const nullRE = /^null$/
*/

const litRE = /^[-+]?[$]?[0-9,]+$|^'[^']*'$|^null$/;
/*
 * determine if extend expression is a constant expression, so that
 * we can inline the extend expression.
 *
 * Conservative approximation -- true => constant expr, but false may or may not be constant
 *
 * Only returns true for simple literal exprs for now; should expand to handle binary ops
 */

const isConstantExpr = (expr: string): boolean => {
  const ret = litRE.test(expr);
  /*
    const selExp = `select (${expr})`
    const selPtree = sqliteParser(selExp)
    const expPtree = selPtree.statement[0].result[0]
    const ret = (expPtree.type === 'literal')
  */

  return ret;
};

const extendQueryToSql = (
  tableMap: TableInfoMap,
  query: QueryExp
): SQLQueryAST => {
  const as = query.valArgs[0];
  const colExp: ColumnExtendExp = query.valArgs[2];
  const sqsql = queryToSql(tableMap, query.tableArgs[0]);
  const subSel = sqsql.selectStmts[0];

  // Note: We only want to extract the column ids from subquery for use at this level; we
  // want to skip any calculated expressions or aggregate functions

  const isConst = colExp.expType === "ConstVal";
  let retSel: SQLSelectAST;

  if (isConst && sqsql.selectStmts.length === 1) {
    // just append our column to existing selectCols list:
    const outSel = subSel.selectCols.slice();
    outSel.push({
      colExp,
      as,
    });
    retSel = _.defaults(
      {
        selectCols: outSel,
      },
      subSel
    );
  } else {
    let colIds = subSel.selectCols.map(getColId);
    let selectCols: SQLSelectListItem[] = colIds.map(mkColSelItem);
    selectCols.push({
      colExp,
      as,
    });
    const from: SQLFromQuery = {
      expType: "query",
      query: sqsql,
    };
    retSel = {
      selectCols,
      from,
      where: "",
      groupBy: [],
      orderBy: [],
    };
  }

  return {
    selectStmts: [retSel],
  };
};

const joinQueryToSql = (
  tableMap: TableInfoMap,
  query: QueryExp
): SQLQueryAST => {
  const [joinType, on] = query.valArgs;
  const [lhsQuery, rhsQuery] = query.tableArgs;
  const lhs = queryToSql(tableMap, lhsQuery);
  const rhs = queryToSql(tableMap, rhsQuery);
  const outSchema = query.getSchema(tableMap); // any type here is flow bug workaround

  const selectCols: Array<any> = outSchema.columns;
  const from: SQLFromJoin = {
    expType: "join",
    joinType,
    lhs,
    rhs,
  };
  const retSel: SQLSelectAST = {
    selectCols,
    from,
    on,
    where: "",
    groupBy: [],
    orderBy: [],
  };
  return {
    selectStmts: [retSel],
  };
};

const genSqlMap: GenSQLMap = {
  table: tableQueryToSql,
  project: projectQueryToSql,
  groupBy: groupByQueryToSql,
  filter: filterQueryToSql,
  mapColumns: mapColumnsQueryToSql(false),
  mapColumnsByIndex: mapColumnsQueryToSql(true),
  concat: concatQueryToSql,
  sort: sortQueryToSql,
  extend: extendQueryToSql,
  join: joinQueryToSql,
};

const queryToSql = (tableMap: TableInfoMap, query: QueryExp): SQLQueryAST => {
  const gen = genSqlMap[query.operator];

  if (!gen) {
    throw new Error(
      "queryToSql: No implementation for operator '" + query.operator + "'"
    );
  }

  const ret = gen(tableMap, query);
  return ret;
};

// Generate a count(*) as rowCount wrapper around a query:
const queryToCountSql = (
  tableMap: TableInfoMap,
  query: QueryExp
): SQLQueryAST => {
  const sqsql = queryToSql(tableMap, query);
  const colExp = mkAggExp("count", constVal("*"));
  const as = "rowCount";
  const selectCols = [
    {
      colExp,
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
    where: "",
    groupBy: [],
    orderBy: [],
  };
  return {
    selectStmts: [retSel],
  };
}; // Create base of a query expression chain by starting with "table":

export const tableQuery = (tableName: string): QueryExp => {
  return new QueryExp("table", [tableName]);
};

class SchemaError {
  message: string;
  rest: Array<any>;

  constructor(message: string, ...rest: Array<any>) {
    this.message = message;
    this.rest = rest;
  }
}

export type ColumnMetaMap = {
  [colId: string]: ColumnMetadata;
};
export class Schema {
  columnMetadata: ColumnMetaMap;
  columns: Array<string>;
  columnIndices: {
    [colId: string]: number;
  };
  _sortedColumns: Array<string> | undefined | null;

  constructor(columns: Array<string>, columnMetadata: ColumnMetaMap) {
    // TODO: really need to clone these to be safe
    this.columns = columns;
    this.columnMetadata = columnMetadata;
    this._sortedColumns = null;
    var columnIndices: { [colId: string]: number } = {};

    for (var i = 0; i < columns.length; i++) {
      var col = columns[i];
      columnIndices[col] = i;
    }

    this.columnIndices = columnIndices;
  }

  columnType(colId: string): ColumnType {
    const md = this.columnMetadata[colId];
    return md.type;
  }

  displayName(colId: string): string {
    const md = this.columnMetadata[colId];
    const dn = (md && md.displayName) || colId;
    return dn;
  }

  columnIndex(colId: string): number {
    return this.columnIndices[colId];
  }

  compatCheck(sb: Schema): boolean {
    if (this.columns.length !== sb.columns.length) {
      throw new SchemaError(
        "incompatible schema: columns length mismatch",
        this,
        sb
      );
    }

    for (var i = 0; i < this.columns.length; i++) {
      var colId = this.columns[i];
      var bColId = sb.columns[i];

      if (colId !== bColId) {
        throw new SchemaError(
          "incompatible schema: expected '" +
            colId +
            "', found '" +
            bColId +
            "'",
          this,
          sb
        );
      }

      var colType = this.columnMetadata[colId].type;
      var bColType = sb.columnMetadata[bColId].type;

      if (colType !== bColType) {
        throw new SchemaError(
          "mismatched column types for col '" +
            colId +
            "': " +
            colType +
            ", " +
            bColType,
          this,
          sb
        );
      }
    }

    return true;
  } // Construct a row map with keys being column ids:

  rowMapFromRow(rowArray: Array<any>): Object {
    var columnIds = this.columns;
    var rowMap: { [cid: string]: any } = {};

    for (var col = 0; col < rowArray.length; col++) {
      rowMap[columnIds[col]] = rowArray[col];
    }

    return rowMap;
  } // calculate extension of this schema (as in extend query):

  extend(colId: string, columnMetadata: ColumnMetadata): Schema {
    var outCols = this.columns.concat([colId]);
    let cMap: { [cid: string]: ColumnMetadata } = {};
    cMap[colId] = columnMetadata;

    var outMetadata = _.extend(cMap, this.columnMetadata);

    var outSchema = new Schema(outCols, outMetadata);
    return outSchema;
  } // returned an array of column ids in locale-sorted order
  // cached lazily

  sortedColumns(): Array<string> {
    let sc = this._sortedColumns;

    if (sc == null) {
      sc = this.columns.slice();
      sc.sort((cid1, cid2) =>
        this.displayName(cid1).localeCompare(this.displayName(cid2))
      );
      this._sortedColumns = sc;
    }

    return sc;
  }
}
export type TableInfo = {
  tableName: string;
  schema: Schema;
};
export type TableInfoMap = {
  [tableName: string]: TableInfo;
};
export class TableRep {
  schema: Schema;
  rowData: Array<Row>;

  constructor(schema: Schema, rowData: Array<Row>) {
    this.schema = schema;
    this.rowData = rowData;
  }

  getRow(row: number): Row {
    return this.rowData[row];
  }

  getColumn(columnId: string): Array<any> {
    const idx = this.schema.columnIndex(columnId);

    if (idx === undefined) {
      throw new Error('TableRep.getColumn: no such column "' + columnId + '"');
    }

    return this.rowData.map((r) => r[columnId]);
  }
}
export interface Connection {
  // eslint-disable-line
  evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number
  ): Promise<TableRep>;
  rowCount(query: QueryExp): Promise<number>;
  getTableInfo(tableName: string): Promise<TableInfo>;
}
