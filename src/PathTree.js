/* @flow */
import * as _ from 'lodash'

/**
 * compact representation of a set of open paths encoded in an object
 * using keys as path components.
 * For example:
 * { "Executive Management": { "General Manager": {} }, "Safety": {},  }
 * represents the two paths:
 *    'Executive Management'/'General Manager'
 *     'Executive Management'/'Safety'
 */
export type Path = Array<string>

type NodeMap = {[elem: string]: NodeMap|{}} // internal rep, not exported

const mkPathObj = (path: Array<string>, idx: number = 0) => {
  let ret = {}
  if (idx === (path.length - 1)) {
    ret[path[idx]] = {}
  } else {
    if (idx < (path.length - 1)) {
      ret[path[idx]] = mkPathObj(path, idx + 1)
    }
  }
  return ret
}

const extendNodeMap = (nm: NodeMap, path: Array<string>): NodeMap => {
  if (path.length === 0) {
    return nm
  }
  const head = path[0]
  const rest = path.slice(1)
  const subMap = nm[head]
  const restMap = subMap ? extendNodeMap(subMap, rest) : mkPathObj(rest)
  const headObj = {}
  headObj[head] = restMap
  return _.defaults(nm, headObj)
}

// remove path from node map:
const removeNodeMap = (nodeMap: ?NodeMap, path: Array<string>): NodeMap => {
  if (!nodeMap) {
    return {}
  }
  const head = path[0]
  const rest = path.slice(1)
  if (rest.length === 0) {
    return _.omit(nodeMap, [head])
  } else {
    let subMap = nodeMap[head]
    if (subMap) {
      const nextSub = removeNodeMap(subMap, rest)
      // immutable replacement of nodeMap[head]:
      const ret = Object.assign({}, nodeMap)
      ret[head] = nextSub
      return ret
    } else {
      // head not in nodeMap?
      return nodeMap
    }
  }
}

// trim an open node map to given depth:
const trimNodeMapToDepth = (nodeMap: Object, depth: number): Object => {
  if (depth === 0) {
    return {}
  }
  let ret = {}
  for (let elem in nodeMap) {
    ret[elem] = trimNodeMapToDepth(nodeMap[elem], depth - 1)
  }
  return ret
}

function * walkNodeMap (prefix: Path,
                      nodeMap: NodeMap): Generator<Path, void, void> { // eslint-disable-line
  for (var component in nodeMap) {
    if (nodeMap.hasOwnProperty(component)) {
      let subPath = prefix.slice()
      subPath.push(component)
      yield subPath // parents before children
      let cval = nodeMap[component]
      if (typeof cval === 'object') {
        yield * walkNodeMap(subPath, cval)
      }
    }
  }
}

/*
 * An immutable PathTree
 */
export default class PathTree {
  _rep: NodeMap

  constructor (nodeMap: NodeMap = {}) {
    this._rep = nodeMap
  }

  trimToDepth (depth: number): PathTree {
    return new PathTree(trimNodeMapToDepth(this._rep, depth))
  }

  // extend PathTree with the given path:
  open (path: Path): PathTree {
    return new PathTree(extendNodeMap(this._rep, path))
  }
  // remove the given path from PathTree:
  close (path: Path): PathTree {
    const nextMap = removeNodeMap(this._rep, path)
    return new PathTree(nextMap)
  }

  isOpen (path: Path): boolean {
    let nm = this._rep
    for (let elem of path) {
      nm = nm[elem]
      if (!nm) {
        return false
      }
    }
    return true
  }

  * iter (): Generator<Path, void, void> { // eslint-disable-line
    yield * walkNodeMap([], this._rep)
  }
}
