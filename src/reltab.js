/* @flow */

import * as Q from 'q'
import * as d3f from 'd3-fetch'
import * as d3a from 'd3-array'
import jsesc from 'jsesc'

/**
 * In older versions of d3, d3.json wasn't promise based, now it is.
 *
 */
export const fetch: (url: string) => Promise<any> = d3f.json

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

type QueryOp = 'table' | 'project' | 'filter' | 'groupBy' | 'mapColumns' | 'mapColumnsByIndex'

export type AggStr = 'uniq' | 'sum' | 'avg'

// An AggColSpec is either a column name (for default aggregation based on column type
// or a pair of column name and AggStr
// TODO: type AggColSpec = string | [string, AggStr]
// For now we'll only handle string types (default agg):
type AggColSpec = string

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

  mapColumnsByIndex (cmap: {[colIndex: number]: ColumnMapInfo}): QueryExp {
    return new QueryExp('mapColumnsByIndex', [cmap], [this])
  }

}

// Create base of a query expression chain by starting with "table":
export const tableQuery = (tableName: string): QueryExp => {
  return new QueryExp('table', [tableName])
}

type Scalar = number|string
type Row = Array<Scalar>

// metadata for a single column:
type ColumnType = 'integer' | 'text'
type ColumnMetadata = { displayName: string, type: ColumnType }

class SchemaError {
  message: string
  rest: Array<any>

  constructor (message: string, ...rest: Array<any>) {
    this.message = message
    this.rest = rest
  }
}

type ColumnMetaMap = {[colId: string]: ColumnMetadata}

class Schema {
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
}

const loadTable = (tableName: string): Promise<TableRep> => {
  return fetch(tableName).then(jsonData => {
    // json format is [ schemaData, { rowData }]
    const [schemaData, {rowData}] = jsonData
    const schema = new Schema(schemaData.columns, schemaData.columnMetadata)
    return new TableRep(schema, rowData)
  }, error => {
    console.error('fetch failed: ', error)
  })
}

const tableCache: {[tableName: string]: Promise<TableRep>} = {}
// simple wrapper around loadTable that uses tableCache:
const tableRefImpl = (tableName: string): Promise<TableRep> => {
  var tcp = tableCache[tableName]
  if (!tcp) {
    // cache miss:
    tcp = loadTable(tableName)
    tableCache[tableName] = tcp
  }
  return tcp
}

// base expressions:  Do not have any sub-table arguments, and produce a promise<TableData>
const baseOpImplMap = {
  'table': tableRefImpl
}

const evalBaseExp = (exp: QueryExp): Promise<TableRep> => {
  const opImpl = baseOpImplMap[exp.operator]
  if (!opImpl) {
    throw new Error('evalBaseExp: unknown primitive table operator "' + exp.operator + '"')
  }
  var args = exp.valArgs
  var opRes = opImpl.apply(null, args)
  return opRes
}

/*
 * A TableOp is a function that takes a number of tables (an Array of TableRep)
 * as an argument and produces a result table
 */
type TableOp = (subTables: Array<TableRep>) => TableRep

// Given an input Schema and an array of columns to project, calculate permutation
// to apply to each row to obtain the projection
const calcProjectionPermutation = (inSchema: Schema, projectCols: Array<string>): Array<number> => {
  var perm = []
  // ensure all columns in projectCols in schema:
  for (var i = 0; i < projectCols.length; i++) {
    const colId = projectCols[ i ]
    if (!(inSchema.columnMetadata[ colId ])) {
      const err = new Error('project: unknown column Id "' + colId + '"')
      throw err
    }
    perm.push(inSchema.columnIndex(colId))
  }
  return perm
}

const projectImpl = (projectCols: Array<string>): TableOp => {
  /* Use the inImpl schema and projectCols to calculate the permutation to
   * apply to each input row to produce the result of the project.
   */
  const calcState = (inSchema: Schema): {schema: Schema, permutation: Array<number> } => {
    const perm = calcProjectionPermutation(inSchema, projectCols)
    const ns = new Schema(projectCols, inSchema.columnMetadata)

    return {schema: ns, permutation: perm}
  }

  const pf = (subTables: Array<TableRep>): TableRep => {
    const tableData = subTables[0]

    const ps = calcState(tableData.schema)
    const permuteOneRow = (row) => d3a.permute(row, ps.permutation)
    const outRowData = tableData.rowData.map(permuteOneRow)

    return new TableRep(ps.schema, outRowData)
  }

  return pf
}

/* An aggregation accumulator (AggAcc) holds hidden internal mutable
 * state to accumulate a value of type T.
 * Additional values can be added to the aggregation with mplus.
 * The result is obtained with finalize
 */
interface AggAcc<T> { // eslint-disable-line
  mplus (x: ?T): void; // eslint-disable-line
  finalize (): T; // eslint-disable-line
} // eslint-disable-line

class SumAgg {
  sum: number
  constructor () {
    this.sum = 0
  }

  mplus (x: ?number): void {
    if (x !== null) {
      this.sum += x
    }
  }
  finalize (): number {
    return this.sum
  }
}

class UniqAgg {
  initial: boolean
  str: ?string

  constructor () {
    this.initial = true
    this.str = null
  }

  mplus (val: any) {
    if (this.initial && val !== null) {
      // this is our first non-null value:
      this.str = val
      this.initial = false
    } else {
      if (this.str !== val) {
        this.str = null
      }
    }
  }

  finalize () {
    return this.str
  }
}

// map from column type to default agg functions:
const defaultAggs = {
  'integer': SumAgg,
  'real': SumAgg,
  'text': UniqAgg
}

/*
  function AvgAgg() {
    this.count = 0;
    this.sum = 0;
  }

  AvgAgg.prototype.mplus = function( val ) {
    if ( typeof val !== "undefined" ) {
      this.count++;
      this.sum += val;
    }
    return this;
  }
  AvgAgg.prototype.finalize = function() {
    if ( this.count == 0 )
      return NaN;
    return this.sum / this.count;
  }

  // map of constructors for agg operators:
  var aggMap = {
    "uniq": UniqAgg,
    "sum": SumAgg,
    "avg": AvgAgg
  }
*/

const groupByImpl = (cols: Array<string>, aggs: Array<AggColSpec>): TableOp => {
  const aggCols: Array<string> = aggs  // TODO: deal with explicitly specified (non-default) aggregations!

  const calcSchema = (inSchema: Schema): Schema => {
    const rs = new Schema(cols.concat(aggCols), inSchema.columnMetadata)
    return rs
  }

  const gbf = (subTables: Array<TableRep>): TableRep => {
    const tableData = subTables[0]
    const inSchema = tableData.schema
    const outSchema = calcSchema(inSchema)

    const aggCols = aggs // TODO: deal with explicitly specified (non-default) aggregations!

    // The groupMap is where actually collect each group value
    type AggGroup = { keyData: Array<any>, aggs: Array<AggAcc<any>> } // eslint-disable-line
    // let groupMap: {[groupKey: string]: AggGroup} = {}
    let groupMap = {}

    const keyPerm = calcProjectionPermutation(inSchema, cols)
    const aggColsPerm = calcProjectionPermutation(inSchema, aggCols)

    // construct and return an an array of aggregation objects appropriate
    // to each agg fn and agg column passed to groupBy

    function mkAggAccs (): Array<AggAcc<any>> { // eslint-disable-line
      return aggCols.map(colId => {
        const aggColType = inSchema.columnMetadata[colId].type
        const AggCtor = defaultAggs[aggColType]
        if (!AggCtor) {
          throw new Error('could not find aggregator for column ' + colId)
        }
        const accObj = new AggCtor()
        return accObj
      })
    }

    for (var i = 0; i < tableData.rowData.length; i++) {
      var inRow = tableData.rowData[ i ]

      var keyData = d3a.permute(inRow, keyPerm)
      var aggInData = d3a.permute(inRow, aggColsPerm)
      var keyStr = JSON.stringify(keyData)
      var groupRow = groupMap[ keyStr ]
      var aggAccs
      if (!groupRow) {
        aggAccs = mkAggAccs()
        // make an entry in our map:
        groupRow = keyData.concat(aggAccs)
        groupMap[ keyStr ] = groupRow
      }
      for (var j = keyData.length; j < groupRow.length; j++) {
        var acc = groupRow[j]
        acc.mplus(aggInData[j - keyData.length])
      }
    }

    // finalize!
    var rowData = []
    for (keyStr in groupMap) {
      if (groupMap.hasOwnProperty(keyStr)) {
        groupRow = groupMap[ keyStr ]
        keyData = groupRow.slice(0, cols.length)
        for (j = keyData.length; j < groupRow.length; j++) {
          groupRow[ j ] = groupRow[ j ].finalize()
        }
        rowData.push(groupRow)
      }
    }
    return new TableRep(outSchema, rowData)
  }

  return gbf
}

type RowPred = (row: Row) => boolean
type RowEval = (row: Row) => any

/*
 * compile the given filter expression with rest to the given schema
 */
function compileFilterExp (schema, fexp) {
  function compileAccessor (vexp: ValExp): RowEval {
    if (vexp.expType === 'ColRef') {
      const idx = schema.columnIndex(vexp.colName)
      if (typeof idx === 'undefined') {
        throw new Error('compiling filter expression: Unknown column identifier "' + vexp.colName + '"')
      }
      return row => row[idx]
    } else {
      const cexp = (vexp : ConstVal)
      return row => cexp.val
    }
  }

  const relOpFnMap = {
    'EQ': (l, r) => l === r,
    'GT': (l, r) => l > r,
    'GE': (l, r) => l >= r,
    'LE': (l, r) => l <= r,
    'LT': (l, r) => l < r
  }

  const compileRelOp = (relop: RelExp): RowPred => {
    const lhsef = compileAccessor(relop.lhs)
    const rhsef = compileAccessor(relop.rhs)
    const cmpFn = relOpFnMap[relop.op]

    function rf (row) {
      var lval = lhsef(row)
      var rval = rhsef(row)
      return cmpFn(lval, rval)
    }
    return rf
  }

  const compileSubExp = (se: SubExp): RowPred => {
    if (se.expType === 'RelExp') {
      return compileRelOp(se)
    } else if (se.expType === 'FilterExp') {
      return compileExp(se)
    } else {
      throw new Error('error compile simple expression ' + JSON.stringify(se) + ': unknown expr type')
    }
  }

  const compileAndExp = (argExps: Array<SubExp>): RowPred => {
    var argCFs = argExps.map(compileSubExp)

    function cf (row) {
      for (var i = 0; i < argCFs.length; i++) {
        var acf = argCFs[ i ]
        var ret = acf(row)
        if (!ret) {
          return false
        }
      }
      return true
    }
    return cf
  }

  const compileOrExp = (argExps: Array<SubExp>): RowPred => {
    throw new Error('OR expressions - not yet implemented')
  }

  const compileExp = (exp: FilterExp): RowPred => {
    let cfn
    if (exp.op === 'AND') {
      cfn = compileAndExp
    } else {
      cfn = compileOrExp
    }
    return cfn(exp.opArgs)
  }

  return {
    'evalFilterExp': compileExp(fexp)
  }
}

const filterImpl = (fexp: FilterExp): TableOp => {
  const ff = (subTables: Array<TableRep>): TableRep => {
    const tableData = subTables[ 0 ]

    const ce = compileFilterExp(tableData.schema, fexp)

    let outRows = []
    for (var i = 0; i < tableData.rowData.length; i++) {
      let row = tableData.rowData[i]
      if (ce.evalFilterExp(row)) {
        outRows.push(row)
      }
    }

    return new TableRep(tableData.schema, outRows)
  }

  return ff
}

/*
 * map the display name or type of columns.
 * TODO: perhaps split this into different functions since most operations are only schema transformations,
 * but type mapping will involve touching all input data.
 */

/*
 * Could almost use an intersection type of {id,type} & ColumnMetadata, but
 * properties are all optional here
 */
type ColumnMapInfo = {id?: string, type?: ColumnType, displayName?: string}

const mapColumnsImpl = (cmap: {[colName: string]: ColumnMapInfo}): TableOp => {
  // TODO: check that all columns are columns of original schema,
  // and that applying cmap will not violate any invariants on Schema....but need to nail down
  // exactly what those invariants are first!

  const mc = (subTables: Array<TableRep>): TableRep => {
    var tableData = subTables[ 0 ]
    var inSchema = tableData.schema

    var outColumns = []
    var outMetadata = {}
    for (var i = 0; i < inSchema.columns.length; i++) {
      var inColumnId = inSchema.columns[ i ]
      var inColumnInfo = inSchema.columnMetadata[ inColumnId ]
      var cmapColumnInfo = cmap[ inColumnId ]
      if (typeof cmapColumnInfo === 'undefined') {
        outColumns.push(inColumnId)
        outMetadata[ inColumnId ] = inColumnInfo
      } else {
        var outColumnId = cmapColumnInfo.id
        if (typeof outColumnId === 'undefined') {
          outColumnId = inColumnId
        }

        // Form outColumnfInfo from inColumnInfo and all non-id keys in cmapColumnInfo:
        var outColumnInfo = JSON.parse(JSON.stringify(inColumnInfo))
        for (var key in cmapColumnInfo) {
          if (key !== 'id' && cmapColumnInfo.hasOwnProperty(key)) {
            outColumnInfo[ key ] = cmapColumnInfo[ key ]
          }
        }
        outMetadata[ outColumnId ] = outColumnInfo
        outColumns.push(outColumnId)
      }
    }
    var outSchema = new Schema(outColumns, outMetadata)

    // TODO: remap types as needed!

    return new TableRep(outSchema, tableData.rowData)
  }

  return mc
}

const mapColumnsByIndexImpl = (cmap: {[colId: number]: ColumnMapInfo}): TableOp => {
  // TODO: try to unify with mapColumns.  Probably means mapColumns will construct an argument to
  // mapColumnsByIndex and use this impl
  function mc (subTables) {
    var tableData = subTables[ 0 ]
    var inSchema = tableData.schema

    var outColumns = []
    var outMetadata = {}
    for (var inIndex = 0; inIndex < inSchema.columns.length; inIndex++) {
      var inColumnId = inSchema.columns[ inIndex ]
      var inColumnInfo = inSchema.columnMetadata[ inColumnId ]
      var cmapColumnInfo = cmap[ inIndex ]
      if (typeof cmapColumnInfo === 'undefined') {
        outColumns.push(inColumnId)
        outMetadata[ inColumnId ] = inColumnInfo
      } else {
        var outColumnId = cmapColumnInfo.id
        if (typeof outColumnId === 'undefined') {
          outColumnId = inColumnId
        }

        // Form outColumnfInfo from inColumnInfo and all non-id keys in cmapColumnInfo:
        var outColumnInfo = JSON.parse(JSON.stringify(inColumnInfo))
        for (var key in cmapColumnInfo) {
          if (key !== 'id' && cmapColumnInfo.hasOwnProperty(key)) {
            outColumnInfo[ key ] = cmapColumnInfo[ key ]
          }
        }
        outMetadata[ outColumnId ] = outColumnInfo
        outColumns.push(outColumnId)
      }
    }
    var outSchema = new Schema(outColumns, outMetadata)

    // TODO: remap types as needed!

    return new TableRep(outSchema, tableData.rowData)
  }

  return mc
}

const simpleOpImplMap = {
  'project': projectImpl,
  'groupBy': groupByImpl,
  'filter': filterImpl,
  'mapColumns': mapColumnsImpl,
  'mapColumbsByIndexImpl': mapColumnsByIndexImpl
}

/*
 * Evaluate a non-base expression from its sub-tables
 */
const evalInteriorExp = (exp: QueryExp, subTables: Array<TableRep>): Promise<TableRep> => {
  const opImpl = simpleOpImplMap[exp.operator]
  if (!opImpl) {
    throw new Error('reltab query evaluation: unsupported operator "' + exp.operator + '"')
  }
  var valArgs = exp.valArgs
  var impFn = opImpl.apply(null, valArgs)
  var tres = impFn(subTables)
  return tres
}

/*
 * use simple depth-first traversal and value numbering to
 * identify common subexpressions for query evaluation.
 *
 * For now, a new evaluator is created for each top-level query
 * and only exists for the duration of query evaluation.
 * Later may want to use some more LRU-like strategy to cache
 * results across top level evaluations.
 */

/* A NumberedQuery is a QueryExp extended with an array mapping all table
 * expressions to corresponding table numbers in associated CSE Evaluator
 */
class NumberedExp {
  exp: QueryExp
  tableNums: Array<number>

  constructor (exp: QueryExp, tableNums: Array<number>) {
    this.exp = exp
    this.tableNums = tableNums
  }
}

class CSEEvaluator {
  invMap: { [expRep: string]: number }    // Map from stringify'ed expr to value number
  valExps: Array<NumberedExp>
  promises: Array<Promise<TableRep>>

  constructor () {
    this.invMap = {}
    this.valExps = []
    this.promises = []
  }

  /*
   * use simple depth-first traversal and value numbering to
   * identify common table subexpressions.
   */
  buildCSEMap (query: QueryExp): number {
    const tableNums = query.tableArgs.map(e => this.buildCSEMap(e))
    const expKey = query.operator + '( [ ' + tableNums.toString() + ' ], ' + JSON.stringify(query.valArgs) + ' )'
    let valNum = this.invMap[expKey]
    if (typeof valNum === 'undefined') {
      // no entry, need to add it:
      // let's use opRep as prototype, and put tableNums in the new object:
      const numExp = new NumberedExp(query, tableNums)
      valNum = this.valExps.length
      this.valExps[valNum] = numExp
      this.invMap[expKey] = valNum
    } // else: cache hit! nothing to do

    return valNum
  }

  /* evaluate the table identified by the specified tableId using the CSE Map.
   * Returns: promise for the result value
   */
  evalTable (tableId: number): Promise<TableRep> {
    var resp = this.promises[tableId]
    if (typeof resp === 'undefined') {
      // no entry yet, make one:
      const numExp = this.valExps[tableId]

      if (numExp.tableNums.length > 0) {
        // dfs eval of sub-tables:
        const subTables = numExp.tableNums.map(tid => this.evalTable(tid))
        resp = Q.all(subTables).then(tvals => evalInteriorExp(numExp.exp, tvals))
      } else {
        resp = evalBaseExp(numExp.exp)
      }
      this.promises[tableId] = resp
    }
    return resp
  }
}

const localEvalQuery = (query: QueryExp): Promise<TableRep> => {
  const evaluator = new CSEEvaluator()
  const tableId = evaluator.buildCSEMap(query)
  return evaluator.evalTable(tableId)
}

export const local = {
  evalQuery: localEvalQuery
}
