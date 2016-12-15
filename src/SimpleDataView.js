/* @flow */
import * as reltab from './reltab'

export default class SimpleDataView {
  rawData: Array<any>
  idMap: Array<any>
  schema: ?reltab.Schema

  constructor () {
    this.rawData = []
    this.idMap = []
    this.schema = null
  }

  getLength (): number {
    return this.rawData.length
  }

  getItem (index: number): any {
    return this.rawData[index]
  }

  getItemMetadata (index: number): any {
    let ret = {}
    const item = this.getItem(index)
    if (!item._isLeaf) {
      ret.cssClasses = 'grid-aggregate-row'
    }
    return ret
  }

  getItemById (id: number): any {
    return this.idMap[id]
  }

  setItems (items: Array<any>): void {
    this.rawData = items
    this.idMap = items.slice()
  }
}
