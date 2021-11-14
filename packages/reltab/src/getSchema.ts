/**
 * get Schema for various related queries
 */

import { SQLDialect } from "./dialect";
import {
  TableQueryRep,
  ProjectQueryRep,
  GroupByQueryRep,
  QueryRep,
  MapColumnsQueryRep,
  MapColumnsByIndexQueryRep,
  ConcatQueryRep,
  ExtendQueryRep,
  JoinQueryRep,
} from "./QueryRep";
import { Schema, ColumnMetadata } from "./Schema";
import { ColumnExtendExp } from "./defs";
import { TableInfoMap } from "./TableRep";
import { ColumnType } from "./ColumnType";
import _ = require("lodash");

const tableGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: TableQueryRep
): Schema => {
  const ti = tableMap[query.tableName];
  if (!ti) {
    throw new Error(
      'tableGetSchema: table "' + query.tableName + '" not found in tableMap'
    );
  }
  return ti.schema;
};

const projectGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  query: ProjectQueryRep
): Schema => {
  const inSchema = queryGetSchema(dialect, tableMap, query.from);
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
  const inSchema = queryGetSchema(dialect, tableMap, query.from);
  const rs = new Schema(dialect, cols.concat(aggCols), inSchema.columnMetadata);
  return rs;
};

const filterGetSchema = (
  dialect: SQLDialect,
  tableMap: TableInfoMap,
  { from }: { from: QueryRep }
): Schema => {
  const inSchema = queryGetSchema(dialect, tableMap, from);
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
  const inSchema = queryGetSchema(dialect, tableMap, query.from);

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
  const inSchema = queryGetSchema(dialect, tableMap, from);

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
  const inSchema = queryGetSchema(dialect, tableMap, from);
  return inSchema;
};

/*
 * Use explicit type if specified, otherwise try to
 * infer column type from expression.
 * Throws if type can not be inferred.
 */
export const getOrInferColumnType = (
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
  const inSchema = queryGetSchema(dialect, tableMap, from);
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

  const lhsSchema = queryGetSchema(dialect, tableMap, lhs);
  const rhsSchema = queryGetSchema(dialect, tableMap, rhs);

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

export const queryGetSchema = (
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
        "queryGetSchema: No implementation for operator, query: " + query
      );
  }
};
