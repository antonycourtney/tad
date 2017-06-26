/* @flow */

import * as baseDialect from './dialects/base'

/*
 * a variant on SimpleDataView that maintains a total row count
 * and a contiguous subset of rows (a viewport) starting from
 * some offset
 */
export default class PagedDataView {
  schema: baseDialect.Schema
  totalRowCount: number
  offset: number
  rawData: Array<any>

  constructor (schema: baseDialect.Schema, totalRowCount: number, offset: number, items: Array<any>) {
    this.schema = schema
    this.totalRowCount = totalRowCount
    this.offset = offset
    this.rawData = items
    // console.log('PagedDataView: trc: ', totalRowCount, ', offset: ', offset)
  }

  // Unfortunately ambiguous method name comes from SlickGrid
  getLength (): number {
    return this.totalRowCount
  }

  getOffset (): number {
    return this.offset
  }

  getItemCount (): number {
    return this.rawData.length
  }

  getItem (index: number): any {
    let ret = null
    const itemIndex = index - this.offset
    if ((itemIndex >= 0) && (itemIndex < this.rawData.length)) {
      ret = this.rawData[itemIndex]
    }
    // console.log('getItem(', index, ') ==> itemIndex: ', itemIndex, ', ret: ', ret)
    return ret
  }

  getItemMetadata (index: number): any {
    let ret = {}
    const item = this.getItem(index)
    if (item && !item._isLeaf) {
      ret.cssClasses = 'grid-aggregate-row'
    }
    return ret
  }
}
