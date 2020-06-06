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

// An AggColSpec is either a column name (for default aggregation based on column type
// or a pair of column name and AggFn
export type AggColSpec = string | [AggFn, string];

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

/*
 * Could almost use an intersection type of {id,type} & ColumnMetadata, but
 * properties are all optional here
 */

export type ColumnMapInfo = {
  id?: string;
  displayName?: string;
};

export type ColumnExtendOptions = {
  displayName?: string;
  type?: ColumnType;
};

interface TableQueryRep {
  operator: "table";
  tableName: string;
}
interface ProjectQueryRep {
  operator: "project";
  cols: string[];
  from: QueryRep;
}
interface GroupByQueryRep {
  operator: "groupBy";
  cols: string[];
  aggs: AggColSpec[];
  from: QueryRep;
}
interface FilterQueryRep {
  operator: "filter";
  fexp: FilterExp;
  from: QueryRep;
}
interface MapColumnsQueryRep {
  operator: "mapColumns";
  cmap: { [colName: string]: ColumnMapInfo };
  from: QueryRep;
}
interface MapColumnsByIndexQueryRep {
  operator: "mapColumnsByIndex";
  cmap: { [colIndex: number]: ColumnMapInfo };
  from: QueryRep;
}
interface ConcatQueryRep {
  operator: "concat";
  target: QueryRep;
  from: QueryRep;
}
interface SortQueryRep {
  operator: "sort";
  keys: [string, boolean][];
  from: QueryRep;
}
interface ExtendQueryRep {
  operator: "extend";
  colId: string;
  colExp: ColumnExtendExp;
  opts: ColumnExtendOptions;
  from: QueryRep;
}
// Join types:  For now: only left outer
export type JoinType = "LeftOuter";
interface JoinQueryRep {
  operator: "join";
  rhs: QueryRep;
  on: string | string[];
  joinType: JoinType;
  lhs: QueryRep;
}
type QueryRep =
  | TableQueryRep
  | ProjectQueryRep
  | GroupByQueryRep
  | FilterQueryRep
  | MapColumnsQueryRep
  | MapColumnsByIndexQueryRep
  | ConcatQueryRep
  | SortQueryRep
  | ExtendQueryRep
  | JoinQueryRep;

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
    return ppSQLQuery(
      dialect,
      queryToSql(dialect, tableMap, this._rep, offset, limit)
    );
  }

  toCountSql(dialect: SQLDialect, tableMap: TableInfoMap): string {
    return ppSQLQuery(dialect, queryToCountSql(dialect, tableMap, this._rep));
  }

  getSchema(dialect: SQLDialect, tableMap: TableInfoMap): Schema {
    return getQuerySchema(dialect, tableMap, this._rep);
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

const tableGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: TableQueryRep
): Schema => {
  return tableMap[query.tableName].schema;
};

const projectGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: ProjectQueryRep
): Schema => {
  const inSchema = getQuerySchema(dialect, tableMap, query.from);
  const { cols } = query;
  return new Schema(dialect, cols, _.pick(inSchema.columnMetadata, cols));
};

const groupByGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: GroupByQueryRep
): Schema => {
  const { cols, aggs } = query;
  const aggCols: Array<string> = aggs.map((aggSpec: string | string[]) =>
    typeof aggSpec === "string" ? aggSpec : aggSpec[1]
  );
  const inSchema = getQuerySchema(dialect, tableMap, query.from);
  const rs = new Schema(dialect, cols.concat(aggCols), inSchema.columnMetadata);
  return rs;
};

const filterGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { from }: { from: QueryRep }
): Schema => {
  const inSchema = getQuerySchema(dialect, tableMap, from);
  return inSchema;
};

const mapColumnsGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: MapColumnsQueryRep
): Schema => {
  const { cmap, from } = query;
  // TODO: check that all columns are columns of original schema,
  // and that applying cmap will not violate any invariants on Schema....but need to nail down
  const inSchema = getQuerySchema(dialect, tableMap, query.from);

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

  const outSchema = new Schema(dialect, outColumns, outMetadata);
  return outSchema;
};

const mapColumnsByIndexGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { cmap, from }: MapColumnsByIndexQueryRep
): Schema => {
  // TODO: try to unify with mapColumns; probably have mapColumns do the
  // mapping to column indices then call this
  const inSchema = getQuerySchema(dialect, tableMap, from);

  var outColumns = [];
  var outMetadata: { [cid: string]: ColumnMetadata } = {};

  for (var inIndex = 0; inIndex < inSchema.columns.length; inIndex++) {
    var inColumnId = inSchema.columns[inIndex];
    var inColumnInfo = inSchema.columnMetadata[inColumnId];
    var cmapColumnInfo = cmap[inIndex];

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

  var outSchema = new Schema(dialect, outColumns, outMetadata);
  return outSchema;
};

const concatGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { from }: ConcatQueryRep
): Schema => {
  const inSchema = getQuerySchema(dialect, tableMap, from);
  return inSchema;
};

/*
 * Use explicit type if specified, otherwise try to
 * infer column type from expression.
 * Throws if type can not be inferred.
 */
const getOrInferColumnType = (
  dialect: SQLDialect,
  inSchema: Schema,
  colType: ColumnType | undefined,
  colExp: ColumnExtendExp
): ColumnType => {
  if (colType !== undefined) {
    return colType;
  }
  switch (colExp.expType) {
    case "ColRef":
      const colType = inSchema.columnType(colExp.colName);
      if (colType === undefined) {
        throw new Error(
          "Could not look up type information for column reference in extend expression: '" +
            colExp.colName +
            "'"
        );
      }
      return colType;
    case "AsString":
      return dialect.coreColumnTypes.string;
    case "ConstVal":
      switch (typeof colExp.val) {
        case "number":
          return dialect.coreColumnTypes.integer;
        case "string":
          return dialect.coreColumnTypes.string;
        case "boolean":
          return dialect.coreColumnTypes.boolean;
        default:
          throw new Error(
            "Could not infer column type for column extend expression: " +
              JSON.stringify(colExp)
          );
      }
    default:
      throw new Error(
        "Could not infer column type for column extend expression: " +
          JSON.stringify(colExp)
      );
  }
};

const extendGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { colId, colExp, opts, from }: ExtendQueryRep
): Schema => {
  const inSchema = getQuerySchema(dialect, tableMap, from);
  const colType = getOrInferColumnType(dialect, inSchema, opts.type, colExp);
  const displayName = opts.displayName != null ? opts.displayName : colId;
  return inSchema.extend(colId, {
    columnType: colType.sqlTypeName,
    displayName,
  });
};

const joinGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { rhs, on, joinType, lhs }: JoinQueryRep
): Schema => {
  if (joinType !== "LeftOuter") {
    throw new Error("unsupported join type: " + joinType);
  }

  const lhsSchema = getQuerySchema(dialect, tableMap, lhs);
  const rhsSchema = getQuerySchema(dialect, tableMap, rhs);

  const rhsCols = _.difference(
    rhsSchema.columns,
    _.concat(on, lhsSchema.columns)
  );

  const rhsMeta = _.pick(rhsSchema.columnMetadata, rhsCols);

  const joinCols = _.concat(lhsSchema.columns, rhsCols);

  const joinMeta = _.defaults(lhsSchema.columnMetadata, rhsMeta);

  const joinSchema = new Schema(dialect, joinCols, joinMeta);
  return joinSchema;
};

const getQuerySchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: QueryRep
): Schema => {
  switch (query.operator) {
    case "table":
      return tableGetSchema(dialect, tableMap, query);
    case "project":
      return projectGetSchema(dialect, tableMap, query);
    case "groupBy":
      return groupByGetSchema(dialect, tableMap, query);
    case "filter":
      return filterGetSchema(dialect, tableMap, query);
    case "mapColumns":
      return mapColumnsGetSchema(dialect, tableMap, query);
    case "mapColumnsByIndex":
      return mapColumnsByIndexGetSchema(dialect, tableMap, query);
    case "concat":
      return concatGetSchema(dialect, tableMap, query);
    case "sort":
      return filterGetSchema(dialect, tableMap, query);
    case "extend":
      return extendGetSchema(dialect, tableMap, query);
    case "join":
      return joinGetSchema(dialect, tableMap, query);
    default:
      const invalidQuery: never = query;
      throw new Error(
        "getQuerySchema: No implementation for operator, query: " + query
      );
  }
};

type GenSQLFunc = (tableMap: TableInfoMap, q: QueryExp) => SQLQueryAST;
type GenSQLMap = {
  [operator: string]: GenSQLFunc;
};

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
  const sqsql = queryToSql(dialect, tableMap, from);

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
  const inSchema = getQuerySchema(dialect, tableMap, from);

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
  const sqsql = queryToSql(dialect, tableMap, from);

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
  const sqsql = queryToSql(dialect, tableMap, from);

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
  const sqsql = queryToSql(dialect, tableMap, from); // apply renaming to invididual select expression:

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
    queryToSql(dialect, tableMap, from),
    queryToSql(dialect, tableMap, target),
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
  const sqsql = queryToSql(dialect, tableMap, from);
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
  const inSchema = getQuerySchema(dialect, tableMap, from);
  const colType = getOrInferColumnType(dialect, inSchema, opts.type, colExp);
  const sqsql = queryToSql(dialect, tableMap, from);
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
  const lhsSql = queryToSql(dialect, tableMap, lhs);
  const rhsSql = queryToSql(dialect, tableMap, rhs);
  const outSchema = getQuerySchema(dialect, tableMap, query);

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

const queryToSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: QueryRep,
  offset?: number,
  limit?: number
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
      throw new Error("queryToSql: No implementation for operator: " + query);
  }
  ret.offset = offset;
  ret.limit = limit;
  return ret;
};

// Generate a count(*) as rowCount wrapper around a query:
const queryToCountSql = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: QueryRep
): SQLQueryAST => {
  const sqsql = queryToSql(dialect, tableMap, query);
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
