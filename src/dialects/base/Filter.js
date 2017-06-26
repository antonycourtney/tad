import Dialect from './Dialect'
import Field from './Field'
import Schema from './Schema'

const _ = require('lodash')

const operatorMap = {
  $begins: '$like',
  $nbegins: '$nlike',
  $ends: '$like',
  $nends: '$nlike',
  $contains: '$like',
  $ncontains: '$nlike'
}

const valueMap = {
  $begins: v => `${v}%`,
  $nbegins: v => `${v}%`,
  $ends: v => `%${v}`,
  $nends: v => `%${v}`,
  $contains: v => `%${v}%`,
  $ncontains: v => `%${v}%`
}

const firstKey = (obj: Object): string => obj && Object.keys(obj)[0]

type FilterLhs = boolean | string | number | Field

export class InvalidFilterError {
  message: string
  rest: Array<any>

  constructor (message: string, ...rest: Array<any>) {
    this.message = message
    this.rest = rest
  }
}

class Filter {
  lhs: FilterLhs
  rhs: any
  op: string
  expType: string
  static dialect: Dialect

  static deserialize (filter) {
    const lhs = firstKey(filter)
    const op = lhs && firstKey(filter[lhs])
    const rhs = lhs && op && filter[lhs][op]

    return new this({ op, lhs, rhs })
  }

  static mapOps (ops) {
    return ops.map((opObj) => {
      const newOp = {}
      _.reject(opObj, _.isUndefined).forEach((operator) => {
        const value = opObj[operator]

        newOp[operatorMap[operator]] = valueMap[value]()
      })

      return newOp
    })
  }

  static opIsUnary (op: string): boolean {
    throw new Error('Filter.opIsUnary should be implemented in subclass')
  }

  static opIsBinary (op: string): boolean {
    throw new Error('Filter.opIsBinary should be implemented in subclass')
  }

  static opDisplayName (op: string): string {
    return op
  }

  constructor ({ op, lhs, rhs } : { op?: string, lhs?: FilterLhs, rhs?: any }) {
    if (op == null) {
      throw new InvalidFilterError('Op must be present')
    }

    if (lhs == null) {
      throw new InvalidFilterError('Left hand side must be present')
    }

    if (!this.constructor.opIsUnary(op) && rhs == null) {
      throw new InvalidFilterError(`"${op}" is not a unary operation, right hand side must be present`)
    }

    this.expType = 'Filter'
    this.lhs = lhs
    this.rhs = rhs
    this.op = op
  }

  // After serialize and deserialize, field information is lost. Need a schema to get it back
  lhsAsField (schema: Schema) {
    if (this.lhs instanceof Field) {
      return this.lhs
    }

    return schema.getField(this.lhs.toString())
  }

  toJS () {
    const operator = operatorMap[this.op] || this.op
    const valueFn = valueMap[this.op] || (v => v)
    const value = valueFn(this.rhs)
    const lhs = this.lhs instanceof Field ? this.lhs.selectableName : this.lhs

    return {
      [lhs.toString()]: { [operator]: value }
    }
  }
}

export default Filter
