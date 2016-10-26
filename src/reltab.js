/* @flow */

import * as d3 from 'd3-fetch'
import * as Immutable from 'immutable'
import jsesc from 'jsesc'
import type { List } from 'immutable' // eslint-disable-line

/**
 * In older versions of d3, d3.json wasn't promise based, now it is.
 *
 */
export const fetch: (url: string) => Promise<any> = d3.json

/**
 * AST for filter expressions, consisting of a tree of
 * nested conjuncts or disjuncts, with relational expressions
 * at the leaves.
 * In Haskell ADT syntax:
 *
 * data BoolOp = AND | OR
 * data FilterExp = FilterExp {op: BoolOp, opArgs: [SubExp] }
 * data SubExp = RelSub RelExp
 *           | FilterSub FilterExp
 * data RelOp = EQ | GT | GE | LT | LE
 * data RelExp = RelExp {lhs: ValRef, op: RelOp, rhs: ValRef }
 * data ValRef = ColRef Ident   -- for now; may extend to dot-delimited path
 *             | Const Literal
 * data Literal = LitNum Number | LitStr String
 */

export type ValExp = ColRef | ConstVal
class ColRef {
  expType: 'ColRef'
  colName: string
  constructor (colName: string) {
    this.expType = 'ColRef'
    this.colName = colName
  }
  toSqlWhere (): string {
    return this.colName
  }
}
export const col = (colName: string) => new ColRef(colName)

type ValType = number|string|Date

class ConstVal {
  expType: 'ConstVal'
  val: ValType
  constructor (val: ValType) {
    this.expType = 'ConstVal'
    this.val = val
  }
  toSqlWhere (): string {
    if (typeof this.val === 'string') {
      return jsesc(this.val, {'wrap': true})
    }
    return String(this.val)
  }
}
export const constVal = (val: ValType) => new ConstVal(val)

export type RelOp = 'EQ' | 'GT' | 'GE' | 'LT' | 'LE'

const ppOpMap = {
  'EQ': '=',
  'GT': '>',
  'GE': '>=',
  'LT': '<',
  'LE': '<='
}

export class RelExp {
  expType: 'RelExp'
  op: RelOp
  lhs: ValExp
  rhs: ValExp

  constructor (op: RelOp, lhs: ValExp, rhs: ValExp) {
    this.expType = 'RelExp'
    this.op = op
    this.lhs = lhs
    this.rhs = rhs
  }

  toSqlWhere (): string {
    return this.lhs.toSqlWhere() + ppOpMap[this.op] + this.rhs.toSqlWhere()
  }

}

export type SubExp = RelExp | FilterExp

export type BoolOp = 'AND' | 'OR'

export class FilterExp {
  expType: 'FilterExp'
  op: BoolOp
  opArgs: List<SubExp>

  constructor (op: BoolOp, opArgs = Immutable.List()) {
    this.expType = 'FilterExp'
    this.op = op
    this.opArgs = opArgs
  }

  // chained operator constructors for relational expressions:
  chainRelExp (op: RelOp, lhs: ValExp, rhs: ValExp): FilterExp {
    const relExp = new RelExp(op, lhs, rhs)
    const extOpArgs = this.opArgs.push(relExp)
    return new FilterExp(this.op, extOpArgs)
  }

  eq (lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainRelExp('EQ', lhs, rhs)
  }
  gt (lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainRelExp('GT', lhs, rhs)
  }
  ge (lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainRelExp('GE', lhs, rhs)
  }
  lt (lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainRelExp('LT', lhs, rhs)
  }
  le (lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainRelExp('LE', lhs, rhs)
  }

  subExp (sub: FilterExp): FilterExp {
    const extOpArgs = this.opArgs.push(sub)
    return new FilterExp(this.op, extOpArgs)
  }

  toSqlWhere (): string {
    const strs = this.opArgs.map(subExp => {
      const subStr = subExp.toSqlWhere()
      if (subExp.expType === 'FilterExp') {
        return '(' + subStr + ')'
      }
      return subStr
    })
    const opStr = ' ' + this.op + ' '
    return strs.join(opStr)
  }
}

export const and = () : FilterExp => new FilterExp('AND')
export const or = () : FilterExp => new FilterExp('OR')
