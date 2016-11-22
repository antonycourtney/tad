/* @flow */

import jsesc from 'jsesc'

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

export class ConstVal {
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
  opArgs: Array<SubExp>

  constructor (op: BoolOp, opArgs: Array<SubExp> = []) {
    this.expType = 'FilterExp'
    this.op = op
    this.opArgs = opArgs
  }

  // chained operator constructors for relational expressions:
  chainRelExp (op: RelOp, lhs: ValExp, rhs: ValExp): FilterExp {
    const relExp = new RelExp(op, lhs, rhs)
    const extOpArgs = this.opArgs.concat(relExp)
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
    const extOpArgs = this.opArgs.concat(sub)
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

type QueryOp = 'table' | 'project' | 'filter' | 'groupBy' |
'mapColumns' | 'mapColumnsByIndex' | 'concat' | 'sort' | 'extend'

export type AggStr = 'uniq' | 'sum' | 'avg'

// An AggColSpec is either a column name (for default aggregation based on column type
// or a pair of column name and AggStr
// TODO: type AggColSpec = string | [string, AggStr]
// For now we'll only handle string types (default agg):
export type AggColSpec = string

type Scalar = ?number | ?string
export type Row = Array<Scalar>

// A RowObject uses column ids from schema as keys:
type RowObject ={[columnId: string]: Scalar}

// metadata for a single column:
export type ColumnType = 'integer' | 'text'
export type ColumnMetadata = { displayName: string, type: ColumnType }

/*
 * A ColumnExtendVal is either a simple scalar or a function from a row object
 * to a scalar.
 */
type ExtendFunc = (row: RowObject) => Scalar // eslint-disable-line
export type ColumnExtendVal = Scalar | ExtendFunc // eslint-disable-line

/*
 * Could almost use an intersection type of {id,type} & ColumnMetadata, but
 * properties are all optional here
 */
export type ColumnMapInfo = {id?: string, type?: ColumnType, displayName?: string}

export class QueryExp {
  expType: 'QueryExp'
  operator: string
  valArgs: Array<any>
  tableArgs: Array<QueryExp>

  constructor (operator: QueryOp, valArgs: Array<any>, tableArgs: Array<QueryExp> = []) {
    this.expType = 'QueryExp'
    this.operator = operator
    this.valArgs = valArgs.slice()
    this.tableArgs = tableArgs.slice()
  }

  // operator chaining methods:
  project (cols: Array<string>): QueryExp {
    return new QueryExp('project', [cols], [this])
  }

  groupBy (cols: Array<string>, aggs: Array<AggColSpec>): QueryExp {
    return new QueryExp('groupBy', [cols, aggs], [this])
  }

  filter (fexp: FilterExp): QueryExp {
    return new QueryExp('filter', [fexp], [this])
  }

  mapColumns (cmap: {[colName: string]: ColumnMapInfo}): QueryExp {
    return new QueryExp('mapColumns', [cmap], [this])
  }

  // colIndex is a string here because Flow doesn't support non-string keys in object literals
  mapColumnsByIndex (cmap: {[colIndex: string]: ColumnMapInfo}): QueryExp {
    return new QueryExp('mapColumnsByIndex', [cmap], [this])
  }

  concat (qexp: QueryExp): QueryExp {
    return new QueryExp('concat', [], [this, qexp])
  }

  sort (keys: Array<[string, boolean]>): QueryExp {
    return new QueryExp('sort', [keys], [this])
  }

  // extend by adding a single column
  extend (colId: string, columnMetadata: ColumnMapInfo, colVal: ColumnExtendVal): QueryExp {
    return new QueryExp('extend', [colId, columnMetadata, colVal], [this])
  }
}

// Create base of a query expression chain by starting with "table":
export const tableQuery = (tableName: string): QueryExp => {
  return new QueryExp('table', [tableName])
}

class SchemaError {
  message: string
  rest: Array<any>

  constructor (message: string, ...rest: Array<any>) {
    this.message = message
    this.rest = rest
  }
}

type ColumnMetaMap = {[colId: string]: ColumnMetadata}

export class Schema {
  columnMetadata: ColumnMetaMap
  columns: Array<string>
  columnIndices:{[colId: string]: number}

  constructor (columns: Array<string>, columnMetadata: ColumnMetaMap) {
    // TODO: really need to clone these to be safe
    this.columns = columns
    this.columnMetadata = columnMetadata

    var columnIndices = {}
    for (var i = 0; i < columns.length; i++) {
      var col = columns[ i ]
      columnIndices[ col ] = i
    }
    this.columnIndices = columnIndices
  }

  columnType (colId: string): ColumnType {
    const md = this.columnMetadata[ colId ]
    return md.type
  }

  displayName (colId: string): string {
    const dn = this.columnMetadata[ colId ].displayName || colId
    return dn
  }

  columnIndex (colId: string): number {
    return this.columnIndices[ colId ]
  }

  compatCheck (sb: Schema): boolean {
    if (this.columns.length !== sb.columns.length) {
      throw new SchemaError('incompatible schema: columns length mismatch', this, sb)
    }
    for (var i = 0; i < this.columns.length; i++) {
      var colId = this.columns[ i ]
      var bColId = sb.columns[ i ]
      if (colId !== bColId) {
        throw new SchemaError("incompatible schema: expected '" + colId + "', found '" + bColId + "'", this, sb)
      }
      var colType = this.columnMetadata[ colId ].type
      var bColType = sb.columnMetadata[ bColId ].type
      if (colType !== bColType) {
        throw new SchemaError("mismatched column types for col '" + colId + "': " + colType + ', ' + bColType, this, sb)
      }
    }
    return true
  }

  // Construct a row map with keys being column ids:
  rowMapFromRow (rowArray: Array<any>): Object {
    var columnIds = this.columns

    var rowMap = { }
    for (var col = 0; col < rowArray.length; col++) {
      rowMap[columnIds[ col ]] = rowArray[ col ]
    }

    return rowMap
  }
}

export class TableRep {
  schema: Schema
  rowData: Array<Row>

  constructor (schema: Schema, rowData: Array<Row>) {
    this.schema = schema
    this.rowData = rowData
  }

  getRow (row: number): Row {
    return this.rowData[ row ]
  }

  getColumn (columnId: string): Array<any> {
    const idx = this.schema.columnIndex(columnId)
    if (idx === undefined) {
      throw new Error('TableRep.getColumn: no such column "' + columnId + '"')
    }
    return this.rowData.map(r => r[idx])
  }
}

export interface Connection { // eslint-disable-line
  evalQuery (query: QueryExp): Promise<TableRep>
}
