/* @flow */

import * as baseDialect from './base'
import { NumFormatPanel, TextFormatPanel } from './base/FormatPanels'
import { TextFormatOptions, NumFormatOptions, FormatOption } from './base/FormatOptions'

export type ColumnType = 'integer' | 'real' | 'text' | 'boolean'

type AggFn = 'avg' | 'count' | 'min' | 'max' | 'sum' | 'uniq' | 'null'
export type BinRelOp = '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte' |
  '$begins' | '$nbegins' | '$ends' | '$nends' |
  '$contains' | '$ncontains'
export type UnaryRelOp = '$null' | '$nnull'
export type RelOp = UnaryRelOp | BinRelOp

const textOnlyBinaryOps = ['$in', '$nin', '$begins', '$nbegins', '$ends', '$nends', '$contains', '$ncontains']
// const textOnlyOpsSet = new Set(textOnlyBinaryOps)
// const textNegBinaryOps = ['$nbegins', '$nends', '$ncontains']
// const textNegOpsSet = new Set(textNegBinaryOps)
const commonBinaryOps = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte']
const binaryOps = commonBinaryOps.concat(textOnlyBinaryOps)
const binaryOpsSet = new Set(binaryOps)

const unaryOps = ['$null', '$nnull']
const unaryOpsSet = new Set(unaryOps)


const textOps = textOnlyBinaryOps.concat(commonBinaryOps).concat(unaryOps)
const numOps = commonBinaryOps.concat(unaryOps)

const ppOpMap = {
  '$eq': '=',
  '$ne': '<>',
  '$gt': '>',
  '$gte': '>=',
  '$lt': '<',
  '$lte': '<=',
  '$in': 'in',
  '$nin': 'not in',
  // TODO: Why do these need to be switched -.-
  '$null': 'is not null',
  '$nnull': 'is null',
  '$begins': 'starts with',
  '$nbegins': 'does not start with',
  '$ends': 'ends with',
  '$nends': 'does not end with',
  '$contains': 'contains',
  '$ncontains': 'does not contain'
}

// TODO: date, time, datetime, URL, ...

const basicAggFns = ['min', 'max', 'uniq', 'null']
const numericAggFns = ['avg', 'count', 'min', 'max', 'sum', 'uniq', 'null']

const defaultAggs = {
  'integer': 'sum',
  'real': 'sum',
  'text': 'uniq',
  'boolean': 'uniq',
  'null': 'uniq'
}

class Filter extends baseDialect.Filter {
  static opIsBinary (op: RelOp): boolean {
    return binaryOpsSet.has(op)
  }
  static opIsUnary (op: RelOp): boolean {
    return unaryOpsSet.has(op)
  }
  static opDisplayName (op: RelOp): string {
    return ppOpMap[op]
  }
}

class Field extends baseDialect.Field {
  static typeIsNumeric (ct: ?ColumnType): boolean {
    return ((ct === 'integer') || (ct === 'real'))
  }

  // $FlowFixMe
  get typeDisplayName (): string {
    return (this.type === 'integer') ? 'int' : this.type
  }
  
  getDefaultFormatOptions (): FormatOption {
    switch (this.type) {
      case 'integer':
        return new NumFormatOptions({ decimalPlaces: 0 })
      case 'boolean':
        return new NumFormatOptions({ decimalPlaces: 0 })
      case 'real':
        return new NumFormatOptions()
      default:
        return new TextFormatOptions()
    }
  }

  getFormatPanel (): (TextFormatPanel | NumFormatPanel) {
    return {
      'text': TextFormatPanel,
      'integer': NumFormatPanel,
      'real': NumFormatPanel,
      'boolean': NumFormatPanel
    }[this.type || 'text']
  }

  availableOps (): Array<string> {
    if (this.type == null || this.type === 'text') {
      return textOps
    }
    return numOps
  }

  availableAggFns (): Array<string> {
    if (this.type == null || this.type === 'text') {
      return basicAggFns
    }

    return numericAggFns
  }

  defaultAggFn () : AggFn {
    if (this.type) {
      return defaultAggs[this.type]
    }

    return 'uniq'
  }

  aggFn (): string {
    if (this.expression === this.uniqExpression()) {
      return 'uniq'
    }

    return super.aggFn()
  }

  // For the handling of `uniq`
  isExpression (aggFn: ?string = ''): boolean {
    return super.isExpression(aggFn) || aggFn === 'uniq'
  }

  uniqExpression (): string {
    return `case when min("${this.name}")=max("${this.name}") then min("${this.name}") else null end`
  }

  aggExpression (aggFn: ?string): string {
    if (aggFn === 'uniq') {
      return this.uniqExpression()
    }

    return super.aggExpression(aggFn)
  }
}

export default new baseDialect.Dialect({
  Field,
  Filter,
  jsonSqlConfig: {
    separatedValues: true,
    namedValues: false,
    dialect: 'sqlite'
  }
})
