/* @flow */

import * as baseDialect from './dialects/base'
import * as _ from 'lodash'
import PathTree from './PathTree'
import type { Connection, QueryExp, Schema } from './dialects/base' // eslint-disable-line
import type { Path } from './PathTree'  // eslint-disable-line
const PATHSEP = '#'
const ENCPATHSEP = '%23'

/*
 *  We used to use encodeURIComponent, but this isn't readily available on
 *  SQLite and we need to use the same encoding in both places so that
 *  path sort order works out correctly.
 *
 *  We'll do this much simpler string encoding that escapes % chars and PATHSEP.
 *  Can still be decoded with decodeURIComponent.
 */
const simpleStringEncode = (str: ?string): ?string => {
  if (str == null) {
    return null
  }
  return str.replace('%', '%25').replace(PATHSEP, ENCPATHSEP)
}

export const encodePath = (path: Path): string => {
  // const eps = path.map(encodeURIComponent)
  const eps = path.map(simpleStringEncode)
  const ret = PATHSEP + eps.join(PATHSEP)
  return ret
}

export const decodePath = (pathStr: string): Path => {
  pathStr = pathStr.slice(1) // drop leading PATHSEP
  const eps = (pathStr.length > 0) ? pathStr.split(PATHSEP) : []
  const path = eps.map(decodeURIComponent)
  return path
}

const addPathCols = (baseQuery: QueryExp,
                      baseDepth: number,
                      maxDepth: number): QueryExp => {
  let retQuery = baseQuery
  for (let i = baseDepth; i < (maxDepth - 1); i++) {
    retQuery = retQuery.extend('_path' + i,
        {}, null)
  }
  return retQuery
}

export class VPivotTree {
  rt: baseDialect.Connection
  baseQuery: QueryExp
  pivotFields: Array<baseDialect.Field>
  pivotLeafFieldId: ?string
  baseSchema: baseDialect.Schema
  dialect: baseDialect.Dialect
  outCols: Array<string>
  rootQuery: ?QueryExp
  sortKey: Array<[string, boolean]>
  aggMap: ?{[cname: string]: baseDialect.AggFn}

  constructor (rt: Connection,
    baseQuery: QueryExp,
    baseSchema: baseDialect.Schema,
    dialect: baseDialect.Dialect,
    pivotFields: Array<baseDialect.Field>,
    pivotLeafFieldId: ?string,
    outCols: Array<string>,
    rootQuery: ?QueryExp,
    sortKey: Array<[string, boolean]>,
    inAggMap: ?{[cname: string]: baseDialect.AggFn}
  ) {
    this.rt = rt
    this.pivotFields = pivotFields
    this.pivotLeafFieldId = pivotLeafFieldId
    this.baseQuery = baseQuery
    this.baseSchema = baseSchema
    this.dialect = dialect
    this.outCols = outCols
    this.rootQuery = rootQuery
    this.sortKey = sortKey
    this.aggMap = inAggMap
  }
  /*
   * returns a query for the children of the specified path:
   */
  applyPath (path: Path): QueryExp {
    // TODO: Think about how to use rollupBy or a smaller number of groupBys that get chopped up
    // and cache result for efficiency

    // queries are immutable so no need to clone:
    var pathQuery = this.baseQuery // recCountQuery

    // We will filter by all path components, and then group by the next pivot Column:
    if (path.length > this.pivotFields.length) {
      throw new Error('applyPath: path length > pivot columns')
    }

    if (path.length > 0) {
      var pred = this.dialect.Condition.and()
      for (var i = 0; i < path.length; i++) {
        let pathElem = path[i]
        let pivotColExp = this.pivotFields[i]
        if (pathElem == null) {
          pred = pred.isNull(pivotColExp)
        } else {
          pred = pred.eq(pivotColExp, pathElem)
        }
      }
      pathQuery = pathQuery.filter(pred)
    }

    var pivotColumnInfo = {name: '_pivot'}

    const aggCols = this.baseSchema.fields.slice()
    const aggMap = this.aggMap
    const gbAggs : any = (aggMap != null) ? aggCols.map(field => field.aggregate(aggMap[field.id])) : aggCols

    if (path.length < this.pivotFields.length) {
      pathQuery = pathQuery
        .groupBy([this.pivotFields[path.length]], gbAggs)
        .mapColumnsByIndex({ '0': pivotColumnInfo })
    } else {
      // leaf level
      const leafExp = (this.pivotLeafFieldId == null) ? null : new this.dialect.Field({ name: this.pivotLeafFieldId })
      pathQuery = pathQuery
        .extend('_pivot', {}, leafExp)
    }

    const depth = path.length + 1

    pathQuery = pathQuery
      .extend('_depth', { type: 'integer' }, depth)
      .extend('_isRoot', { type: 'boolean' }, 0)
      .project(this.outCols)

      /*
       * The point of the '_sortVal_<i>' column is that it will be 1 for all rows of
       * depth >= i, 0 for rows where depth < i (which are higher in the pivot tree).
       * We do an ascending sort on this before
       * adding the '_sortVal_<i>_<j>' cols to ensure that parents always come
       * before their children; without this we'd end up putting parent row
       * immediately after children when sorted descending by some column
       */
    const maxDepth = this.pivotFields.length + 1
    for (let i = 0; i < maxDepth; i++) {
      const depthVal = (depth > i) ? 1 : 0
      pathQuery = pathQuery.extend('_sortVal_' + i, {type: 'integer'}, depthVal)
    }

    for (let i = 0; i < this.pivotFields.length; i++) {
      let pathElemExp = null
      if (i < path.length) {
        pathElemExp = path[i]
      } else if (i === path.length) {
        pathElemExp = new this.dialect.Field({ name: '_pivot' })  // N.B. Not a literal; SQL expression referring to _pivot column
      }

      pathQuery = pathQuery.extend('_path' + i, {type: 'text'}, pathElemExp)
    }
    // TODO: Should we optionally also insert _childCount and _leafCount ?
    // _childCount would count next level of groupBy,
    // _leafCount would do count() at point of calculating
    // filter for current path (before doing groupBy).
    // These can certainly have non-trivial costs to calculate
    return pathQuery
  }

  /*
   * get query for joining with pathQuery to sort to specified depth
   */
  getSortQuery (depth: number): QueryExp {
    let sortQuery = this.baseQuery // recCountQuery

    const sortCols = this.sortKey.map(p => p[0] instanceof this.dialect.Field ? p[0] : this.baseSchema.getField(p[0]))
    const aggMap = this.aggMap
    console.log('sort agg')
    const sortColAggs : any = (aggMap != null) ? sortCols.map(field => field.aggregate(aggMap[field.id])) : sortCols

    const gbCols = this.pivotFields.slice(0, depth)

    sortQuery = sortQuery
      .groupBy(gbCols, sortColAggs)

    let fieldMap = {}
    console.log(gbCols)
    for (let i = 0; i < gbCols.length; i++) {
      const pathColName = '_path' + i
      fieldMap[gbCols[i].selectableName] = { name: pathColName }
    }
    sortQuery = sortQuery.mapColumns(fieldMap)

    const pathLevel = depth - 1

    let sortColMap = {}
    for (let i = 0; i < sortCols.length; i++) {
      let fieldIndex = gbCols.length + i
      let fieldName = '_sortVal_' + pathLevel.toString() + '_' + i.toString()
      sortColMap[fieldIndex.toString()] = { name: fieldName }
    }
    sortQuery = sortQuery.mapColumnsByIndex(sortColMap)

    return sortQuery
  }

  /*
   * get query for full tree state from a set of openPaths
   */
  getTreeQuery (openPaths: PathTree): QueryExp {
    const maxDepth = this.pivotFields.length + 1
    let resQuery = null

    if (this.rootQuery) {
      resQuery = this.rootQuery
      for (let i = 0; i < maxDepth; i++) {
        resQuery = resQuery.extend('_sortVal_' + i, {type: 'integer'}, 0)
      }
      resQuery = addPathCols(resQuery, 0, maxDepth)
    }

    const openRoot = this.applyPath([]) // immediate children of root
    if (resQuery) {
      resQuery = resQuery.concat(openRoot)
    } else {
      resQuery = openRoot
    }

    for (let path of openPaths.iter()) {
      let subQuery = this.applyPath(path)
      resQuery = resQuery.concat(subQuery)
    }

    const sortArg = []
    for (let i = 0; i < maxDepth - 1; i++) {
      sortArg.push(['_path' + i, true])
    }
    resQuery = resQuery.sortBy(sortArg)
    return resQuery
  }

/*
 * get query for full tree state from a set of openPaths, joined with
 * relevant sort queries based on pivot depth, and with appropriate
 * order by clause
 */
  getSortedTreeQuery (openPaths: PathTree): QueryExp {
    const tq = this.getTreeQuery(openPaths)

    let jtq: QueryExp = tq
    // add sort queries for each pivot depth and join to tree query
    for (let i = 0; i < this.pivotFields.length; i++) {
      let depth = i + 1
      let sq: QueryExp = this.getSortQuery(depth)
      let joinKey: Array<string> = _.range(0, depth).map(j => '_path' + j)
      jtq = jtq.join(sq, joinKey)
    }

    // Now let's work out the sort key:
    // potential opt: Eliminate if root not shown
    let tsortKey = [['_isRoot', false]]

    for (let i = 0; i < this.pivotFields.length; i++) {
      // should be able to do a simple tsortKey.push for next line, but flow being lame
      tsortKey = tsortKey.concat([['_sortVal_' + i.toString(), true]])
      // sort keys for this depth:
      let dsortKey = _.range(0, this.sortKey.length)
                .map(j => ['_sortVal_' + i + '_' + j, this.sortKey[j][1]])
      tsortKey = tsortKey.concat(dsortKey)
      // splice in path at this depth:
      tsortKey = tsortKey.concat([['_path' + i, true]])
    }

    // Add the final _sortVal_i:
    const maxDepth = this.pivotFields.length
    tsortKey = tsortKey.concat([['_sortVal_' + maxDepth.toString(), true]])

    // Finally, add the sort key columns itself for leaf level:
    tsortKey = tsortKey.concat(this.sortKey)

    const stq = jtq.sortBy(tsortKey)
    return stq
  }
}

export const getBaseSchema = (dialect: baseDialect.Dialect, rt: baseDialect.Connection,
    baseQuery: QueryExp): Promise<Schema> => {
  // add a count column and do the usual SQL where 1=0 trick:
  // TODO: Why do we need to do a 1 = 0 here? And what is Rec?
  // const schemaQuery = baseQuery.extend('Rec', { type: 'integer' }, 1)
  //
  // const schemap = rt.evalQuery(schemaQuery)
  // return schemap.then(schemaRes => schemaRes.schema)

  return baseQuery.getSchema()
}

export const vpivot = (rt: baseDialect.Connection,
    initialBaseQuery: QueryExp,
    baseSchema: Schema,
                       dialect: baseDialect.Dialect,
    pivotFields: Array<baseDialect.Field>,
    pivotLeafFieldId: ?string,
    showRoot: boolean,
    sortKey: Array<[baseDialect.Field, boolean]>,
    inAggMap: ?{[id: string]: string} = null
  ): VPivotTree => {
  const aggMap = _.mapKeys(inAggMap, (v, key) => _.last(key.split('.'))) // Strip fully qualified names
  const hiddenFields = ['_depth', '_pivot', '_isRoot']
  const baseQuery = initialBaseQuery.extend('Rec', { type: 'integer' }, 1)
  const outFieldNames = baseQuery.getSchema().columns.concat(hiddenFields)


  const gbFields = baseQuery.getSchema().fields.slice()
  const gbAggs = (aggMap != null) ? gbFields.map(field => field.aggregate(aggMap[field.id])) : gbFields

  let rootQuery = null
  if (showRoot) {
    rootQuery = baseQuery
      .groupBy([], gbAggs)
      .extend('_pivot', { }, null)
      .extend('_depth', { type: 'integer' }, 0)
      .extend('_isRoot', { type: 'boolean' }, 1)
      .project(outFieldNames)
  }

  return new VPivotTree(rt, baseQuery, baseQuery.getSchema(), dialect, pivotFields,
    pivotLeafFieldId, outFieldNames, rootQuery, sortKey, aggMap)
}
