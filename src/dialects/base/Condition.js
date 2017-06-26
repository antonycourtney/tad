import JsonSql from 'json-sql'
import { List } from 'immutable'
import Filter from './Filter'
import Dialect from './Dialect'

class Condition {
  filters: List<Filter>
  op: string
  expType: string
  static dialect: Dialect
  static jsonSql: JsonSql

  static deserialize (condition) {
    const op = Object.keys(condition)[0]
    return new this(op, condition[op].map(c => Filter.deserialize(c)))
  }

  static and () : Condition {
    return new this('$and')
  }

  static or () : Condition {
    return new this('$or')
  }

  constructor (op: string = '$and', filters: Array<Filter> = []) {
    this.op = op
    this.filters = List(filters)
    this.expType = 'Condition'
  }

  contains (lhs: any, rhs: any): Condition {
    this.filters = this.filters.push(new this.constructor.dialect.Filter({ op: '$in', lhs, rhs }))
  }

  eq (lhs: any, rhs: any): Condition {
    this.filters = this.filters.push(new this.constructor.dialect.Filter({ op: '$eq', lhs, rhs }))
    return this
  }
  gt (lhs: any, rhs: any): Condition {
    this.filters = this.filters.push(new this.constructor.dialect.Filter({ op: '$gt', lhs, rhs }))
    return this
  }
  ge (lhs: any, rhs: any): Condition {
    this.filters = this.filters.push(new this.constructor.dialect.Filter({ op: '$gte', lhs, rhs }))
    return this
  }
  lt (lhs: any, rhs: any): Condition {
    this.filters = this.filters.push(new this.constructor.dialect.Filter({ op: '$lt', lhs, rhs }))
    return this
  }
  le (lhs: any, rhs: any): Condition {
    this.filters = this.filters.push(new this.constructor.dialect.Filter({ op: '$lte', lhs, rhs }))
    return this
  }
  isNull (arg: any): Condition {
    this.filters = this.filters.push(new this.constructor.dialect.Filter({ op: '$null', lhs: arg, rhs: true }))
    return this
  }
  isNotNull (arg: any): Condition {
    this.filters = this.filters.push(new this.constructor.dialect.Filter({ op: '$nnull', lhs: arg, rhs: true }))
    return this
  }

  toJS () {
    return {
      [this.op]: this.filters.toArray().map(f => f.toJS())
    }
  }

  toSqlWhere () {
    return this.constructor.jsonSql.build({
      table: 'foo',
      condition: this.toJS()
    }).query.replace(/select \* from "foo"/g, '').replace(/;$/, '')
  }
}

export default Condition
