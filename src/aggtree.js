/* @flow */

import * as reltab from './reltab'
const {col, constVal} = reltab

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

export const encodePath = (path: Path): string => {
  const eps = path.map(encodeURIComponent)
  const ret = PATHSEP + eps.join(PATHSEP)
  return ret
}

export const decodePath = (pathStr: string): Path => {
  pathStr = pathStr.slice(1) // drop leading PATHSEP
  const eps = (pathStr.length > 0) ? pathStr.split(PATHSEP) : []
  const path = eps.map(decodeURIComponent)
  return path
}

export class VPivotTree {
  rt: reltab.Connection
  rtBaseQuery: reltab.QueryExp
  pivotColumns: Array<string>
  baseSchema: reltab.Schema
  outCols: Array<string>
  rootQuery: reltab.QueryExp

  constructor (rt: Connection, rtBaseQuery: reltab.QueryExp,
    pivotColumns: Array<string>,
    baseSchema: reltab.Schema,
    outCols: Array<string>,
    rootQuery: reltab.QueryExp) {
    this.rt = rt
    this.pivotColumns = pivotColumns
    this.rtBaseQuery = rtBaseQuery
    this.baseSchema = baseSchema
    this.outCols = outCols
    this.rootQuery = rootQuery
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
      pathQuery = pathQuery
        .extend('_pivot', { type: 'text' }, "''")
    }

    // add _depth and _path column and project to get get column order correct:

    const basePathStr = encodePath(path)
    const pathDelim = (path.length > 0) ? PATHSEP : ''

    // TODO (major!): use of encodeURIComponent() in function of extend() below means
    // we most likely can't run this function directly in the database.
    // Either need to arrange to support this in the db server (best) or find a way to
    // do some local post-processing on results we get back from the db

    /*
     * An attempt to encode the path calculation in SQL:
     */
    // TODO: This is a naieve and unsafe way to perform the encoding
    // At the very least, need to nest this with an extra replace of % character itself
    const pathExp = `'${basePathStr}${pathDelim}' || replace("_pivot",'${PATHSEP}','${ENCPATHSEP}')`
    console.log('applyPath: pathExp: ', pathExp)

    pathQuery = pathQuery
      .extend('_depth', { type: 'integer' }, path.length + 1)
//      .extend('_path', {type: 'text'}, r => basePathStr + pathDelim + encodeURIComponent((r._pivot: any)))
      .extend('_path', {type: 'text'}, pathExp)
      .project(this.outCols)

    // TODO: Should we optionally also insert _childCount and _leafCount ?
    // _childCount would count next level of groupBy, _leafCount would do count() at point of calculating
    // filter for current path (before doing groupBy).
    // These can certainly have non-trivial costs to calculate
    // Probably also want to explicitly insert _path0..._pathN columns!
    return pathQuery
  }

  /*
   * get query for full tree state from a set of openPaths
   */
  getTreeQuery (openPaths: PathTree): reltab.QueryExp {
    let resQuery = this.rootQuery

    function walkPath (pivotTree, treeQuery, prefix, pathMap) {
      for (var component in pathMap) {
        if (pathMap.hasOwnProperty(component)) {
          // add this component to our query:
          var subPath = prefix.slice()
          subPath.push(component)
          var subQuery = pivotTree.applyPath(subPath)
          treeQuery = treeQuery.concat(subQuery)

          // and recurse, if appropriate:
          var cval = pathMap[ component ]
          if (typeof cval === 'object') {
            treeQuery = walkPath(pivotTree, treeQuery, subPath, cval)
          }
        }
      }
      return treeQuery
    }

    if (openPaths) {
      resQuery = resQuery.concat(this.applyPath([])) // open root level!
    }
    var tq = walkPath(this, resQuery, [], openPaths)

    tq = tq.sort([ [ '_path', true ] ])
    return tq
  }
}

export const vpivot = (rt: reltab.Connection, rtBaseQuery: reltab.QueryExp,
pivotColumns: Array<string>): Promise<VPivotTree> => {
  // add a count column:
  rtBaseQuery = rtBaseQuery.extend('Rec', { type: 'integer' }, 1)
  // obtain schema for base query:
  // TODO:  Don't want to evaluate entire query just to get schema!
  // Need to change interface of RelTab to return a true TableDataSource that has calculated
  // Schema but not yet calculated rowdata...
  const basep = rt.evalQuery(rtBaseQuery)
  return basep.then(baseRes => {
    const baseSchema = baseRes.schema

    let outCols = [ '_depth', '_pivot', '_path' ]
    outCols = outCols.concat(baseSchema.columns)

    const gbCols = baseSchema.columns.slice()

    const rootQuery = rtBaseQuery
      .groupBy([], gbCols)
      .extend('_pivot', { type: 'text' }, null)
      .extend('_depth', { type: 'integer' }, 0)
      .extend('_path', {type: 'text'}, "''")
      .project(outCols)

    return new VPivotTree(rt, rtBaseQuery, pivotColumns, baseSchema, outCols, rootQuery)
  })
}
