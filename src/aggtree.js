/* @flow */

import * as reltab from './reltab'
const {col, constVal} = reltab
import * as _ from 'lodash'

import type { Connection } from './reltab' // eslint-disable-line

const PATHSEP = '#'
const ENCPATHSEP = '%23'

export type Path = Array<string>

/*
 * A PathTree is a set of paths encoded in an object using keys as path components.
 * For example:
 * { "Executive Management": { "General Manager": {} }, "Safety": {},  }
 * represents the two paths:
 *    'Executive Management'/'General Manager'
 *     'Executive Management'/'Safety'
 */
export type PathTree = Object

/*
 *  We used to use encodeURIComponent, but this isn't readily available on
 *  SQLite and we need to use the same encoding in both places so that
 *  path sort order works out correctly.
 *
 *  We'll do this much simpler string encoding that escapes % chars and PATHSEP.
 *  Can still be decoded with decodeURIComponent.
 */
const simpleStringEncode = (str: string): string => {
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

const addPathCols = (baseQuery: reltab.QueryExp,
                      baseDepth: number,
                      maxDepth: number): reltab.QueryExp => {
  let retQuery = baseQuery
  for (let i = baseDepth; i < (maxDepth - 1); i++) {
    retQuery = retQuery.extend('_path' + i,
        {type: 'text'}, null)
  }
  return retQuery
}

export class VPivotTree {
  rt: reltab.Connection
  rtBaseQuery: reltab.QueryExp
  pivotColumns: Array<string>
  pivotLeafColumn: ?string
  baseSchema: reltab.Schema
  outCols: Array<string>
  rootQuery: ?reltab.QueryExp
  sortKey: Array<[string, boolean]>

  constructor (rt: Connection, rtBaseQuery: reltab.QueryExp,
    pivotColumns: Array<string>,
    pivotLeafColumn: ?string,
    baseSchema: reltab.Schema,
    outCols: Array<string>,
    rootQuery: ?reltab.QueryExp,
    sortKey: Array<[string, boolean]>) {
    this.rt = rt
    this.pivotColumns = pivotColumns
    this.pivotLeafColumn = pivotLeafColumn
    this.rtBaseQuery = rtBaseQuery
    this.baseSchema = baseSchema
    this.outCols = outCols
    this.rootQuery = rootQuery
    this.sortKey = sortKey
  }
  /*
   * returns a query for the children of the specified path:
   */
  applyPath (path: Path): reltab.QueryExp {
    // TODO: Think about how to use rollupBy or a smaller number of groupBys that get chopped up
    // and cache result for efficiency

    // queries are immutable so no need to clone:
    var pathQuery = this.rtBaseQuery // recCountQuery

    // We will filter by all path components, and then group by the next pivot Column:
    if (path.length > this.pivotColumns.length) {
      throw new Error('applyPath: path length > pivot columns')
    }

    if (path.length > 0) {
      var pred = reltab.and()
      for (var i = 0; i < path.length; i++) {
        pred = pred.eq(col(this.pivotColumns[i]), constVal(path[i]))
      }
      pathQuery = pathQuery.filter(pred)
    }

    var pivotColumnInfo = {id: '_pivot', type: 'text', displayName: '_pivot'}

    if (path.length < this.pivotColumns.length) {
      pathQuery = pathQuery
        .groupBy([this.pivotColumns[path.length]], this.baseSchema.columns)
        .mapColumnsByIndex({ '0': pivotColumnInfo })
    } else {
      // leaf level
      const leafExp = (this.pivotLeafColumn == null) ? "''" : 'CAST("' + this.pivotLeafColumn + '" as TEXT)'
      pathQuery = pathQuery
        .extend('_pivot', { type: 'text' }, leafExp)
    }

    const depth = path.length + 1

    pathQuery = pathQuery
      .extend('_depth', { type: 'integer' }, depth)
      .extend('_isRoot', { type: 'boolean' }, 0)
      .project(this.outCols)

      /*
       * The point of the '_sortVal_<i>' column is that it will be 1 for all rows of
       * depth >= depth after performing the join on this sort query, null for
       * items higher in the hierarchy.  We do an ascending sort on this before
       * adding the '_sortVal_<i>_<j>' cols to ensure that parents always come
       * before their children; without this we'd end up putting parent row
       * immediately after children when some sorted descending by some column
       */
      // sortQuery = sortQuery.extend('_sortVal_' + pathLevel.toString(), {type: 'integer'}, 1)
    const maxDepth = this.pivotColumns.length + 1
    for (let i = 0; i < maxDepth; i++) {
      const depthVal = (depth > i) ? 1 : 0
      pathQuery = pathQuery.extend('_sortVal_' + i, {type: 'integer'}, depthVal)
    }

    for (let i = 0; i < this.pivotColumns.length; i++) {
      let pathElemExp = null
      if (i < path.length) {
        pathElemExp = `'${path[i]}'`
      } else if (i === path.length) {
        pathElemExp = '"_pivot"'
      }

      pathQuery = pathQuery.extend('_path' + i,
            {type: 'text'}, pathElemExp)
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
  getSortQuery (depth: number): reltab.QueryExp {
    let sortQuery = this.rtBaseQuery // recCountQuery

    let sortCols = this.sortKey.map(p => p[0])

    const gbCols = this.pivotColumns.slice(0, depth)

    sortQuery = sortQuery
      .groupBy(gbCols, sortCols)

    let colMap = {}
    for (let i = 0; i < gbCols.length; i++) {
      const pathColName = '_path' + i
      colMap[gbCols[i]] = { id: pathColName }
    }
    sortQuery = sortQuery.mapColumns(colMap)

    const pathLevel = depth - 1

    let sortColMap = {}
    for (let i = 0; i < sortCols.length; i++) {
      let colIndex = gbCols.length + i
      let colName = '_sortVal_' + pathLevel.toString() + '_' + i.toString()
      sortColMap[colIndex.toString()] = { id: colName }
    }
    sortQuery = sortQuery.mapColumnsByIndex(sortColMap)

    return sortQuery
  }

  /*
   * get query for full tree state from a set of openPaths
   */
  getTreeQuery (openPaths: PathTree): reltab.QueryExp {
    const maxDepth = this.pivotColumns.length + 1
    let resQuery = null

    if (this.rootQuery) {
      resQuery = this.rootQuery
      for (let i = 0; i < maxDepth; i++) {
        resQuery = resQuery.extend('_sortVal_' + i, {type: 'integer'}, 0)
      }
      resQuery = addPathCols(resQuery, 0, maxDepth)
    }

    const walkPath = (treeQuery, prefix, pathMap) => {
      for (var component in pathMap) {
        if (pathMap.hasOwnProperty(component)) {
          // add this component to our query:
          var subPath = prefix.slice()
          subPath.push(component)
          var subQuery = this.applyPath(subPath)
          treeQuery = treeQuery.concat(subQuery)

          // and recurse, if appropriate:
          var cval = pathMap[ component ]
          if (typeof cval === 'object') {
            treeQuery = walkPath(treeQuery, subPath, cval)
          }
        }
      }
      return treeQuery
    }

    const openRoot = this.applyPath([]) // immediate children of root
    if (resQuery) {
      resQuery = resQuery.concat(openRoot)
    } else {
      resQuery = openRoot
    }
    var tq = walkPath(resQuery, [], openPaths)

    const sortArg = []
    for (let i = 0; i < maxDepth - 1; i++) {
      sortArg.push(['_path' + i, true])
    }
    tq = tq.sort(sortArg)
    return tq
  }

/*
 * get query for full tree state from a set of openPaths, joined with
 * relevant sort queries based on pivot depth, and with appropriate
 * order by clause
 */
  getSortedTreeQuery (openPaths: PathTree): reltab.QueryExp {
    console.log('getSortedTreeQuery: openPaths: ', openPaths)
    const tq = this.getTreeQuery(openPaths)

    let jtq = tq
    // add sort queries for each pivot depth and join to tree query
    for (let i = 0; i < this.pivotColumns.length; i++) {
      let depth = i + 1
      let sq = this.getSortQuery(depth)
      let joinKey = _.range(0, depth).map(j => '_path' + j)
      jtq = jtq.join(sq, joinKey)
    }

    // Now let's work out the sort key:
    // potential opt: Eliminate if root not shown
    let tsortKey = [['_isRoot', false]]

    for (let i = 0; i < this.pivotColumns.length; i++) {
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
    const maxDepth = this.pivotColumns.length
    tsortKey = tsortKey.concat([['_sortVal_' + maxDepth.toString(), true]])

    // Finally, add the sort key columns itself for leaf level:
    tsortKey = tsortKey.concat(this.sortKey)

    const stq = jtq.sort(tsortKey)
    return stq
  }
}

export const vpivot = (rt: reltab.Connection,
    rtBaseQuery: reltab.QueryExp,
    pivotColumns: Array<string>,
    pivotLeafColumn: ?string,
    showRoot: boolean,
    sortKey: Array<[string, boolean]>
  ): Promise<VPivotTree> => {
  console.log('vpivot: sortKey: ', sortKey)

  // add a count column:
  rtBaseQuery = rtBaseQuery.extend('Rec', { type: 'integer' }, 1)
  // obtain schema for base query:

  // TODO:  Don't want to evaluate entire query just to get schema!
  // Need to change interface of RelTab to return a true TableDataSource that has calculated
  // Schema but not yet calculated rowdata...

  // For now we'll do the usual SQL where 1=0 trick:
  const schemaQuery = rtBaseQuery.filter(reltab.and().eq(constVal(1), constVal(0)))

  const basep = rt.evalQuery(schemaQuery)
  return basep.then(baseRes => {
    const baseSchema = baseRes.schema
    const hiddenCols = ['_depth', '_pivot', '_isRoot']
    const outCols = baseSchema.columns.concat(hiddenCols)

    const gbCols = baseSchema.columns.slice()

    let rootQuery = null
    if (showRoot) {
      rootQuery = rtBaseQuery
        .groupBy([], gbCols)
        .extend('_pivot', { type: 'text' }, null)
        .extend('_depth', { type: 'integer' }, 0)
        .extend('_isRoot', {type: 'boolean'}, 1)
        .project(outCols)
    }

    return new VPivotTree(rt, rtBaseQuery, pivotColumns, pivotLeafColumn, baseSchema, outCols, rootQuery, sortKey)
  })
}
