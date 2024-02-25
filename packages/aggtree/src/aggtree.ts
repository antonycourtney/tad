import * as reltab from "reltab";
import * as _ from "lodash";
import { Path, PathTree } from "./PathTree";
import {
  DataSourceConnection,
  QueryExp,
  Schema,
  AggColSpec,
  asString,
  ValExp,
  ColumnMapInfo,
} from "reltab"; // eslint-disable-line
import { convertTypeAcquisitionFromJson } from "typescript";

export * from "./PathTree";

const { col, constVal } = reltab;
const PATHSEP = "#";
const ENCPATHSEP = "%23";
/*
 *  We used to use encodeURIComponent, but this isn't readily available on
 *  SQLite and we need to use the same encoding in both places so that
 *  path sort order works out correctly.
 *
 *  We'll do this much simpler string encoding that escapes % chars and PATHSEP.
 *  Can still be decoded with decodeURIComponent.
 */

const simpleStringEncode = (str?: string | null): string | undefined | null => {
  if (str == null) {
    return null;
  }

  return str.replace("%", "%25").replace(PATHSEP, ENCPATHSEP);
};

export const encodePath = (path: Path): string => {
  // const eps = path.map(encodeURIComponent)
  const eps = path.map(simpleStringEncode);
  const ret = PATHSEP + eps.join(PATHSEP);
  return ret;
};
export const decodePath = (pathStr: string): Path => {
  pathStr = pathStr.slice(1); // drop leading PATHSEP

  const eps = pathStr.length > 0 ? pathStr.split(PATHSEP) : [];
  const path = eps.map(decodeURIComponent);
  return path;
};

const addPathCols = (
  baseQuery: QueryExp,
  baseDepth: number,
  maxDepth: number
): QueryExp => {
  let retQuery = baseQuery;

  for (let i = baseDepth; i < maxDepth - 1; i++) {
    retQuery = retQuery.extend("_path" + i, asString(constVal(null)));
  }

  return retQuery;
};

export class VPivotTree {
  rt: DataSourceConnection;
  baseQuery: QueryExp;
  pivotColumns: Array<string>;
  pivotLeafColumn: string | undefined | null;
  baseSchema: reltab.Schema;
  outCols: Array<string>;
  rootQuery: QueryExp | undefined | null;
  sortKey: Array<[string, boolean]>;
  aggMap:
    | {
        [cid: string]: reltab.AggFn;
      }
    | undefined
    | null;

  constructor(
    rt: DataSourceConnection,
    baseQuery: QueryExp,
    baseSchema: reltab.Schema,
    pivotColumns: Array<string>,
    pivotLeafColumn: string | undefined | null,
    outCols: Array<string>,
    rootQuery: QueryExp | undefined | null,
    sortKey: Array<[string, boolean]>,
    inAggMap?: {
      [cid: string]: reltab.AggFn;
    } | null
  ) {
    this.rt = rt;
    this.pivotColumns = pivotColumns;
    this.pivotLeafColumn = pivotLeafColumn;
    this.baseQuery = baseQuery;
    this.baseSchema = baseSchema;
    this.outCols = outCols;
    this.rootQuery = rootQuery;
    this.sortKey = sortKey;
    this.aggMap = inAggMap;
  }
  /*
   * returns a query for the children of the specified path:
   */

  applyPath(path: Path): QueryExp {
    // TODO: Think about how to use rollupBy or a smaller number of groupBys that get chopped up
    // and cache result for efficiency
    // queries are immutable so no need to clone:
    var pathQuery = this.baseQuery; // recCountQuery
    // We will filter by all path components, and then group by the next pivot Column:

    if (path.length > this.pivotColumns.length) {
      throw new Error("applyPath: path length > pivot columns");
    }

    if (path.length > 0) {
      var pred = reltab.and();

      for (var i = 0; i < path.length; i++) {
        let pathElem = path[i];
        let pivotColExp = col(this.pivotColumns[i]);

        if (pathElem == null) {
          pred = pred.isNull(pivotColExp);
        } else {
          pred = pred.eq(pivotColExp, constVal(pathElem));
        }
      }

      pathQuery = pathQuery.filter(pred);
    }

    const pivotColumnInfo: ColumnMapInfo = {
      id: "_pivot",
      displayName: "_pivot",
    };
    const aggCols = this.baseSchema.columns;
    const aggMap = this.aggMap;
    const gbAggs: any =
      aggMap != null ? aggCols.map((cid) => [aggMap[cid], cid]) : aggCols;

    if (path.length < this.pivotColumns.length) {
      /* was: 
      pathQuery = pathQuery
        .groupBy([this.pivotColumns[path.length]], gbAggs)
        .mapColumnsByIndex({
          "0": pivotColumnInfo,
        });
        ...but this leads to ambiguity in the use of the pivot column name, that some SQL engines (BigQuery) don't like,
        so we'll push the definition of _pivot column inside the GroupBy:
      */
      pathQuery = pathQuery
        .extend("_pivot", asString(col(this.pivotColumns[path.length])), {
          displayName: "_pivot",
        })
        .groupBy(["_pivot"], gbAggs);
    } else {
      // leaf level
      const leafExp =
        this.pivotLeafColumn == null
          ? constVal("")
          : asString(col(this.pivotLeafColumn!));
      pathQuery = pathQuery.extend("_pivot", leafExp);
    }

    const depth = path.length + 1;
    pathQuery = pathQuery
      .extend("_depth", constVal(depth))
      .extend("_isRoot", constVal(false))
      .project(this.outCols);
    /*
     * The point of the '_sortVal_<i>' column is that it will be 1 for all rows of
     * depth >= i, 0 for rows where depth < i (which are higher in the pivot tree).
     * We do an ascending sort on this before
     * adding the '_sortVal_<i>_<j>' cols to ensure that parents always come
     * before their children; without this we'd end up putting parent row
     * immediately after children when sorted descending by some column
     */

    const maxDepth = this.pivotColumns.length + 1;

    for (let i = 0; i < maxDepth; i++) {
      const depthVal = depth > i ? 1 : 0;
      pathQuery = pathQuery.extend("_sortVal_" + i, constVal(depthVal));
    }

    for (let i = 0; i < this.pivotColumns.length; i++) {
      let pathElemExp: ValExp = constVal(null);

      if (i < path.length) {
        let colType = this.baseSchema.columnType(this.pivotColumns[i]);
        pathElemExp = constVal(path[i]);
      } else if (i === path.length) {
        pathElemExp = col("_pivot"); // SQL expression referring to _pivot column
      }

      pathQuery = pathQuery.extend("_path" + i, asString(pathElemExp));
    }

    // TODO: Should we optionally also insert _childCount and _leafCount ?
    // _childCount would count next level of groupBy,
    // _leafCount would do count() at point of calculating
    // filter for current path (before doing groupBy).
    // These can certainly have non-trivial costs to calculate

    return pathQuery;
  }
  /*
   * get query for joining with pathQuery to sort to specified depth
   */

  getSortQuery(depth: number): QueryExp {
    let sortQuery = this.baseQuery; // recCountQuery

    const sortCols = this.sortKey.map((p) => p[0]);
    const aggMap = this.aggMap;
    const sortColAggs: any =
      aggMap != null ? sortCols.map((cid) => [aggMap[cid], cid]) : sortCols;
    const gbCols = this.pivotColumns.slice(0, depth);
    sortQuery = sortQuery.groupBy(gbCols, sortColAggs);
    let colMap: { [cid: string]: { id: string } } = {};

    for (let i = 0; i < gbCols.length; i++) {
      const pathColName = "_path" + i;
      colMap[gbCols[i]] = {
        id: pathColName,
      };
    }

    sortQuery = sortQuery.mapColumns(colMap);
    const pathLevel = depth - 1;
    let sortColMap: { [cid: string]: { id: string } } = {};

    for (let i = 0; i < sortCols.length; i++) {
      let colIndex = gbCols.length + i;
      let colName = "_sortVal_" + pathLevel.toString() + "_" + i.toString();
      sortColMap[colIndex.toString()] = {
        id: colName,
      };
    }

    sortQuery = sortQuery.mapColumnsByIndex(sortColMap);
    return sortQuery;
  }
  /*
   * get query for full tree state from a set of openPaths
   */

  getTreeQuery(openPaths: PathTree): QueryExp {
    const maxDepth = this.pivotColumns.length + 1;
    let resQuery = null;

    if (this.rootQuery) {
      resQuery = this.rootQuery;

      for (let i = 0; i < maxDepth; i++) {
        resQuery = resQuery.extend("_sortVal_" + i, constVal(0));
      }

      resQuery = addPathCols(resQuery, 0, maxDepth);
    }

    const openRoot = this.applyPath([]); // immediate children of root

    if (resQuery) {
      resQuery = resQuery.concat(openRoot);
    } else {
      resQuery = openRoot;
    }

    for (let path of openPaths.iter()) {
      let subQuery = this.applyPath(path);
      resQuery = resQuery.concat(subQuery);
    }

    const sortArg: [string, boolean][] = [];

    for (let i = 0; i < maxDepth - 1; i++) {
      sortArg.push(["_path" + i, true]);
    }

    resQuery = resQuery.sort(sortArg);
    return resQuery;
  }
  /*
   * get query for full tree state from a set of openPaths, joined with
   * relevant sort queries based on pivot depth, and with appropriate
   * order by clause
   */

  getSortedTreeQuery(openPaths: PathTree): QueryExp {
    const tq = this.getTreeQuery(openPaths);
    let jtq = tq; // add sort queries for each pivot depth and join to tree query

    for (let i = 0; i < this.pivotColumns.length; i++) {
      let depth = i + 1;
      let sq = this.getSortQuery(depth);

      let joinKey = _.range(0, depth).map((j) => "_path" + j);

      jtq = jtq.join(sq, joinKey);
    }

    // Now let's work out the sort key:
    // potential opt: Eliminate if root not shown

    let tsortKey: [string, boolean][] = [];

    if (this.rootQuery !== null) {
      tsortKey.push(["_isRoot", false]);
    }
    let stq: reltab.QueryExp = jtq;

    if (this.pivotColumns.length > 0 || this.sortKey.length > 0) {
      for (let i = 0; i < this.pivotColumns.length; i++) {
        tsortKey.push(["_sortVal_" + i.toString(), true]);

        // sort keys for this depth:
        let dsortKey: [string, boolean][] = _.range(0, this.sortKey.length).map(
          (j) => ["_sortVal_" + i + "_" + j, this.sortKey[j][1]]
        );

        tsortKey = tsortKey.concat(dsortKey); // splice in path at this depth:

        tsortKey.push(["_path" + i, true]);
      }

      // Add the final _sortVal_i:
      const maxDepth = this.pivotColumns.length;
      tsortKey.push(["_sortVal_" + maxDepth.toString(), true]); // Finally, add the sort key columns itself for leaf level:

      tsortKey = tsortKey.concat(this.sortKey);
    }

    if (tsortKey.length > 0) {
      stq = stq.sort(tsortKey);
    }

    return stq;
  }
}
export const getBaseSchema = (
  rt: DataSourceConnection,
  baseQuery: QueryExp,
  showRecordCount = true
): Promise<Schema> => {
  // add a count column and do the usual SQL where 1=0 trick:
  let schemaQuery = baseQuery.filter(reltab.and().eq(constVal(1), constVal(0)));
  if (showRecordCount) {
    schemaQuery = schemaQuery.extend("Rec", constVal(1));
  }

  const schemap = rt.evalQuery(schemaQuery);
  return schemap.then((schemaRes) => schemaRes.schema);
};
export function vpivot(
  rt: DataSourceConnection,
  baseQuery: QueryExp,
  baseSchema: Schema,
  pivotColumns: Array<string>,
  pivotLeafColumn: string | undefined | null,
  showRoot: boolean,
  sortKey: Array<[string, boolean]>,
  inAggMap:
    | {
        [cid: string]: reltab.AggFn;
      }
    | undefined
    | null = null,
  showRecordCount = true
): VPivotTree {
  const aggMap = inAggMap; // just for Flow

  if (showRecordCount) {
    baseQuery = baseQuery.extend("Rec", constVal(1));
  }
  const hiddenCols = ["_depth", "_pivot", "_isRoot"];
  const outCols = baseSchema.columns.concat(hiddenCols);
  const gbCols = baseSchema.columns.slice();
  const gbAggs: AggColSpec[] =
    aggMap != null ? gbCols.map((cid) => [aggMap[cid], cid]) : gbCols;
  let rootQuery = null;

  if (showRoot) {
    rootQuery = baseQuery
      .groupBy([], gbAggs)
      .extend("_pivot", asString(constVal(null)))
      .extend("_depth", constVal(0))
      .extend("_isRoot", constVal(true))
      .project(outCols);
  }

  return new VPivotTree(
    rt,
    baseQuery,
    baseSchema,
    pivotColumns,
    pivotLeafColumn,
    outCols,
    rootQuery,
    sortKey,
    aggMap
  );
}
