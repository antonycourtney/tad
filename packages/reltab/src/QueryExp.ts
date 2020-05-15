import {
  Scalar,
  sqlEscapeString,
  ColumnExtendExp,
  col,
  constVal,
  defaultDialect,
} from "./defs";
import { FilterExp, BinRelExp, UnaryRelExp } from "./FilterExp";
import { SQLDialect } from "./dialect";
import { Schema, ColumnType, ColumnMetadata } from "./Schema";
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

// We'll add "nullstr" here, but don't expect it to show up in any UI; generated
// during toSql elaboration step.
export type AggFn =
  | "avg"
  | "count"
  | "min"
  | "max"
  | "sum"
  | "uniq"
  | "null"
  | "nullstr";

// An AggColSpec is either a column name (for default aggregation based on column type
// or a pair of column name and AggFn
export type AggColSpec = string | [AggFn, string];

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
export const typeIsString = (ct: ColumnType): boolean => {
  return ct === "text";
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
};

// Join types:  For now: only left outer
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

  // TODO: Should probably use a distinct type from ColumnMapInfo where
  // type is mandatory:
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

type GenSQLFunc = (tableMap: TableInfoMap, q: QueryExp) => SQLQueryAST;
type GenSQLMap = {
  [operator: string]: GenSQLFunc;
};

const tableQueryToSql = (tableMap: TableInfoMap, tq: QueryExp): SQLQueryAST => {
  const tableName = tq.valArgs[0];
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

const defaultAggs: { [CT in ColumnType]: AggFn } = {
  integer: "sum",
  real: "sum",
  text: "uniq",
  string: "uniq",
  boolean: "uniq",
};

export const defaultAggFn = (colType: ColumnType): AggFn => {
  let afn: AggFn | undefined = defaultAggs[colType];
  if (afn == null) {
    afn = "null";
  }
  return afn;
};

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
      if (typeIsString(inSchema.columnType(cid))) {
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
  tableMap: TableInfoMap,
  query: QueryExp
): SQLQueryAST => {
  const fexp: FilterExp = query.valArgs[0];
  const sqsql = queryToSql(tableMap, query.tableArgs[0]);

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
  const colMetadata: ColumnMapInfo = query.valArgs[1];
  const colExp: ColumnExtendExp = query.valArgs[2];
  const sqsql = queryToSql(tableMap, query.tableArgs[0]);
  const subSel = sqsql.selectStmts[0];

  // Note: We only want to extract the column ids from subquery for use at this level; we
  // want to skip any calculated expressions or aggregate functions

  const isConst = colExp.expType === "ConstVal";
  let retSel: SQLSelectAST;

  let colType: ColumnType;

  if (colMetadata.type == null) {
    const msg = `extend query: column '${as}': type required in column metadata in extend operation`;
    console.error(msg);
    throw new Error(msg);
  }
  colType = colMetadata.type;

  if (isConst && sqsql.selectStmts.length === 1) {
    // just append our column to existing selectCols list:
    const outSel = subSel.selectCols.slice();
    outSel.push({
      colExp,
      colType,
      as,
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
      colType: colMetadata.type,
      as,
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
  tableMap: TableInfoMap,
  query: QueryExp
): SQLQueryAST => {
  const [joinType, on] = query.valArgs;
  const [lhsQuery, rhsQuery] = query.tableArgs;
  const lhs = queryToSql(tableMap, lhsQuery);
  const rhs = queryToSql(tableMap, rhsQuery);
  const outSchema = query.getSchema(tableMap);

  const selectCols: SQLSelectListItem[] = outSchema.columns.map((cid) =>
    mkColSelItem(cid, outSchema.columnType(cid))
  );
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
  const selectCols: SQLSelectListItem[] = [
    {
      colExp,
      colType: "integer",
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
  return new QueryExp("table", [tableName]);
};
