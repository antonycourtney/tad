import React from 'react'
import { Record } from 'immutable'
import Dialect from './Dialect'
import Func from './Func'
import Filter from './Filter'
import FuncArg from './FuncArg'
import jsonify from './jsonify'
import type { FormatOption } from './FormatOptions'

class Field extends Record({
  table: undefined,
  _id: undefined,
  name: '',
  displayName: undefined,
  type: undefined,
  cast: undefined,
  alias: undefined,
  func: undefined,
  value: undefined,
  expression: undefined,
  expType: 'Field'
}) {
  table: string
  name: string
  _id: string
  displayName: string
  type: string
  cast: string
  alias: string
  func: Func
  value: any
  expression: string
  expType: string
  static dialect: Dialect

  toJS () {
    const originalObj = super.toJS()
    originalObj.cast = originalObj.cast || this.isHidden() ? this.type : undefined

    return jsonify(originalObj)
  }

  toJSON () {
    return this.toJS()
  }

  isAggregated (): boolean {
    return !!(this.expression || this.func)
  }


  availableOps (): Array<string> {
    throw new Error('Field.availableOps must be implemented in subclass')
  }

  availableAggFns (): Array<string> {
    throw new Error('Field.availableAggFns must be implemented in subclass')
  }

  defaultAggFn () : string {
    throw new Error('Field.defaultAggFn must be implemented in subclass')
  }

  getDefaultFormatOptions () : FormatOption {
    throw new Error('Field.getDefaultFormatOptions must be implemented in subclass')
  }

  getFormatPanel (): React.Component {
    throw new Error('Field.getFormatPanel must be implemented in subclass')
  }

  aggFn (): string {
    if (this.func) {
      return this.func.name
    }

    return this.defaultAggFn()
  }

  // Only needs to be implements if `isExpression` is implemented
  aggExpression (aggFn: ?string): string {
    if (aggFn === 'null') {
      return 'null'
    }

    aggFn = aggFn || ''
    throw new Error(`Expression does not exists for agg function "${aggFn}"`)
  }

  // Expression logic is needed for sqlite uniq
  isExpression (aggFn: ?string) {
    return aggFn === 'null'
  }

  aggFuncObj (aggFn: ?string): Func {
    const agg = aggFn || this.aggFn()

    return new Func({
      name: agg,
      args: [
        new FuncArg({ field: this.name })
      ]
    })
  }

  filter (op: string, rhs: any): Filter {
    return new this.constructor.dialect.Filter({ lhs: this, op, rhs })
  }

  aggregate (aggFn: ?string = this.defaultAggFn()): Field {
    let aggExp
    // Have to emulate uniq
    if (this.isExpression(aggFn)) {
      aggExp = {
        expression: this.aggExpression(aggFn),
        func: undefined
      }
    } else {
      aggExp = {
        expression: undefined,
        cast: this.type,
        func: this.aggFuncObj(aggFn)
      }
    }

    return new this.constructor.dialect.Field({
      ...this.toJS(),
      alias: this.selectableName,
      ...aggExp
    })
  }

  // If it's a _pivot, _sort, _path, etc.
  isHidden () {
    return this.selectableName.match(/^(_isLeaf|_isOpen|_parentId|_id|_isRoot|_depth|_pivot|_path\d+|_sortVal_\d+_?(\d+)?)$/g)
  }

  // A unique identifier to refer to this field
  get id (): string {
    // Retain ids where possible.
    return this._id || (this.table ? this.table + '.' + this.selectableName : this.selectableName)
  }

  // If this field were in a subquery, what would we select it as?
  get selectableName (): string {
    return this.alias || this.name
  }

  get typeDisplayName (): string {
    return this.type
  }

  constructor (params: Object) {
    // All existing fields have a display name. But if we're building one from scratch,
    // make sure to set it.
    if (!(params instanceof Field)) {
      params.displayName = params.displayName || params.alias || params.name
      params.id = params._id || params.id
    }

    super(params)
  }
}

export default Field
