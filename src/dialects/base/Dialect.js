import React from 'react'
import JsonSql from 'json-sql'
import Field from './Field'
import Filter from './Filter'
import Func from './Func'
import FuncArg from './FuncArg'
import Condition from './Condition'
import Schema from './Schema'
import QueryExp from './QueryExp'
import type { FormatOption } from './FormatOptions'
import * as DefaultFormatOptions from './FormatOptions'

const _ = require('lodash')

type QueryReq = { query: QueryExp, offset?: number, limit?: number }

type QueryBuilderType = QueryExp | Field | Func | FuncArg | Filter | Condition | Schema

const extendWithDialect = (Klass, d: Dialect) =>
  // $FlowFixMe
  class extends Klass {
    // $FlowFixMe
    static get dialect () {
      return d
    }
  }

// TODO: Figure out how to denote it's not an instance, but the actual class in flow
class Dialect {
  //QueryExp: Class<QueryExp>
  //Field: Class<Field>
  //Func: Class<Func>
  //FuncArg: Class<FuncArg>
  //Filter: Class<Filter>
  //Condition: Class<Condition>
  //Schema: Class<Schema>

  QueryExp: any
  Field: any
  Func: any
  FuncArg: any
  Filter: any
  Condition: any
  Schema: any

  // Again, these are classes, not instances...
  FormatOptions: Array<any>
  getFormatPanel: (string) => React.Component
  defaultFormats: { [type: string]: FormatOption }

  constructor (
    // $FlowFixMe
    {
      QueryExp: qe = QueryExp,
      Field: f = Field,
      Func: fn = Func,
      FuncArg: fa = FuncArg,
      Filter: fi = Filter,
      Condition: c = Condition,
      Schema: s = Schema,
      jsonSqlConfig,
      FormatOptions = {}
    }
    //{ QueryExp?: Class<QueryExp>, Field?: Class<Field>, Func?: Class<Func>, FuncArg?: Class<FuncArg>, Filter?: Class<Filter>, Condition?: Class<Condition>, Schema?: Class<Schema> }
  ) {
    // $FlowFixMe
    this.QueryExp = class extends extendWithDialect(qe, this) {
      // $FlowFixMe
      static get jsonSql() {
        return new JsonSql(jsonSqlConfig)
      }
    }

    this.Field = extendWithDialect(f, this)
    this.Func = extendWithDialect(fn, this)
    this.FuncArg = extendWithDialect(fa, this)
    this.Filter = extendWithDialect(fi, this)

    // $FlowFixMe
    this.Condition = class extends extendWithDialect(c, this) {
      // $FlowFixMe
      static get jsonSql() {
        return new JsonSql({ ...jsonSqlConfig, separatedValues: false })
      }
    }

    this.Schema = extendWithDialect(s, this)    // $FlowFixMe


    // There will be some default/provided options, dialects can provide additional options
    this.FormatOptions = { ...DefaultFormatOptions, ...FormatOptions }

    // TODO: Don't know or care why flow doesn't like this.
    // $FlowFixMe
    this.tableQuery = this.tableQuery.bind(this)
    // $FlowFixMe
    this.deserializeFormats = this.deserializeFormats.bind(this)
    // $FlowFixMe
    this.deserializeFormat = this.deserializeFormat.bind(this)
    // $FlowFixMe
    this.queryReviver = this.queryReviver.bind(this)
    // $FlowFixMe
    this.deserializeQueryReq = this.deserializeQueryReq.bind(this)
    // $FlowFixMe
    this.tableRepReviver = this.tableRepReviver.bind(this)
    // $FlowFixMe
    this.deserializeTableRep = this.deserializeTableRep.bind(this)
  }

  // Create base of a query expression chain by starting with "table":
  tableQuery (tableInfo: any): QueryExp {
    const { schema: { fields }, tableName } = tableInfo

    return new this.QueryExp({
      table: tableName,
      fields
    })
  }

  deserializeFormat (format: FormatOption) {
    const FormatOptions = this.FormatOptions[format.type]
    if (!FormatOptions) {
      throw new Error(`No format options class specified for ${format.type}`)
    }
    return new FormatOptions(format)
  }

  deserializeFormats (formats: { type: string }): Array<Object> {
    return _.mapValues(formats, this.deserializeFormat.bind(this))
  }

  queryReviver (key: string, val: any): any {
    const reviverMap = {
      'Condition': (v) => this.Condition.deserialize(v),
      'Filter': (v) => this.Filter.deserialize(v),
      'FuncArg': (v) => new this.FuncArg(v),
      'Func': (v) => new this.Func(v),
      'Field': (v) => new this.Field(v),
      'Query': (v) => new this.QueryExp(v)
    }
    let retVal = val
    if (val != null) {
      if (typeof val === 'object') {
        const rf = reviverMap[val.expType]
        if (rf) {
          retVal = rf(val)
        } else {
          if (val.hasOwnProperty('expType')) {
            // should probably throw...
            console.warn('*** no reviver found for expType ', val.expType)
          }
        }
      }
    }
    return retVal
  }

  deserializeQueryReq (jsonStr: string): QueryReq {
    const rq = JSON.parse(jsonStr, this.queryReviver)

    return rq
  }

  tableRepReviver (key: string, val: any): any {
    let retVal = val
    if (key === 'schema') {
      retVal = new this.Schema(val.fields)
    }
    return retVal
  }

  deserializeTableRep (jsonStr: string): TableRep {
    const rt = JSON.parse(jsonStr, this.tableRepReviver)

    return rt
  }

  deserializeTableInfo (jsonStr: string): TableInfo {
    return JSON.parse(jsonStr, this.tableRepReviver)
  }
}

export default Dialect
