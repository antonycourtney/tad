/* @flow */

const _ = require('lodash')

/* eslint-disable no-use-before-define */

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
 * data BinaryRelOp = EQ | GT | GE | LT | LE
 * data UnaryRelOp = ISNULL | ISNOTNULL
 * data RelExp = BinaryRelExp {lhs: ValRef, op: RelOp, rhs: ValRef }
*              | UnaryRelExp {op: UnaryRelOp, arg: ValRef }
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
    return '"' + this.colName + '"'
  }
}
export const col = (colName: string) => new ColRef(colName)

type ValType = number|string|Date

const escRegEx = /[\0\n\r\b\t\\'"\x1a]/g

export const sqlEscapeString = (inStr: string): string => {
  const outStr = inStr.replace(escRegEx, s => {
    switch (s) {
      case '\0':
        return '\\0'
      case '\n':
        return '\\n'
      case '\r':
        return '\\r'
      case '\b':
        return '\\b'
      case '\t':
        return '\\t'
      case '\x1a':
        return '\\Z'
      case "'":
        return "''"
      case '"':
        return '""'
      default:
        return '\\' + s
    }
  })
  return ["'", outStr, "'"].join('')
}

export class ConstVal {
  expType: 'ConstVal'
  val: ValType
  constructor (val: ValType) {
    this.expType = 'ConstVal'
    this.val = val
  }
  toSqlWhere (): string {
    if (typeof this.val === 'string') {
      return sqlEscapeString(this.val)
    }
    return String(this.val)
  }
}
export const constVal = (val: ValType) => new ConstVal(val)

export type BinRelOp = 'EQ' | 'GT' | 'GE' | 'LT' | 'LE'

const ppOpMap = {
  'EQ': '=',
  'GT': '>',
  'GE': '>=',
  'LT': '<',
  'LE': '<=',
  'ISNULL': 'is null',
  'NOTNULL': 'is not null'
}

export class BinRelExp {
  expType: 'BinRelExp'
  op: BinRelOp
  lhs: ValExp
  rhs: ValExp

  constructor (op: BinRelOp, lhs: ValExp, rhs: ValExp) {
    this.expType = 'BinRelExp'
    this.op = op
    this.lhs = lhs
    this.rhs = rhs
  }

  toSqlWhere (): string {
    return this.lhs.toSqlWhere() + ppOpMap[this.op] + this.rhs.toSqlWhere()
  }
}

export type UnaryRelOp = 'ISNULL' | 'NOTNULL'

export class UnaryRelExp {
  expType: 'UnaryRelExp'
  op: UnaryRelOp
  arg: ValExp

  constructor (op: UnaryRelOp, arg: ValExp) {
    this.expType = 'UnaryRelExp'
    this.op = op
    this.arg = arg
  }

  toSqlWhere (): string {
    return this.arg.toSqlWhere() + ' ' + ppOpMap[this.op]
  }
}

export type RelExp = BinRelExp | UnaryRelExp

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
  chainBinRelExp (op: BinRelOp, lhs: ValExp, rhs: ValExp): FilterExp {
    const relExp = new BinRelExp(op, lhs, rhs)
    const extOpArgs = this.opArgs.concat(relExp)
    return new FilterExp(this.op, extOpArgs)
  }

  chainUnaryRelExp (op: UnaryRelOp, arg: ValExp): FilterExp {
    const relExp = new UnaryRelExp(op, arg)
    const extOpArgs = this.opArgs.concat(relExp)
    return new FilterExp(this.op, extOpArgs)
  }

  eq (lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp('EQ', lhs, rhs)
  }
  gt (lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp('GT', lhs, rhs)
  }
  ge (lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp('GE', lhs, rhs)
  }
  lt (lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp('LT', lhs, rhs)
  }
  le (lhs: ValExp, rhs: ValExp): FilterExp {
    return this.chainBinRelExp('LE', lhs, rhs)
  }
  isNull (arg: ValExp): FilterExp {
    return this.chainUnaryRelExp('ISNULL', arg)
  }
  isNotNull (arg: ValExp): FilterExp {
    return this.chainUnaryRelExp('NOTNULL', arg)
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
'mapColumns' | 'mapColumnsByIndex' | 'concat' | 'sort' | 'extend' | 'join'

export type AggFn = 'avg' | 'count' | 'min' | 'max' | 'sum' | 'uniq' | 'null'

// An AggColSpec is either a column name (for default aggregation based on column type
// or a pair of column name and AggFn
export type AggColSpec = string | [AggFn, string]

type Scalar = ?number | ?string | ?boolean
export type Row = {[columnId: string]: Scalar}

// metadata for a single column:
// TODO: date, time, datetime, URL, ...
export type ColumnType = 'integer' | 'real' | 'text' | 'boolean'
export type ColumnMetadata = { displayName: string, type: ColumnType }

const basicAggFns = ['min', 'max', 'uniq', 'null']
const numericAggFns = ['avg', 'count', 'min', 'max', 'sum', 'uniq', 'null']

export const aggFns = (ct: ColumnType): Array<AggFn> => {
  if (ct === 'text') {
    return basicAggFns
  }
  return numericAggFns
}

/*
 * generate a SQL literal for the given value based on its
 * column type.
 *
 * Will need work if we enrich the column type system.
 */
export const sqlLiteralVal = (ct: ColumnType, jsVal: any): string => {
  let ret
  if (jsVal == null) {
    ret = 'null'
  } else {
    ret = (ct === 'text') ? sqlEscapeString(jsVal) : jsVal.toString()
  }
  return ret
}

/*
 * A ColumnExtendVal is either a simple scalar or a function from a row object
 * to a scalar.
 */
type ExtendFunc = (row: Row) => Scalar // eslint-disable-line
export type ColumnExtendVal = Scalar | ExtendFunc // eslint-disable-line

/*
 * Could almost use an intersection type of {id,type} & ColumnMetadata, but
 * properties are all optional here
 */
export type ColumnMapInfo = {id?: string, type?: ColumnType, displayName?: string}

// Join types:  For now: only left outer
export type JoinType = 'LeftOuter'

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

  /* We'd like to use Array<AggColSpec> as arg to groupBy but
   * that causes Flow to get confused. We can probably fix
   * by changing QueryExp to be a Disjoint Union type instead
   * of current untyped args arrays (which predates adding Flow annotations):
   * https://flow.org/en/docs/types/unions/#toc-disjoint-unions
   */
  groupBy (cols: Array<string>, aggs: Array<any>): QueryExp {
    const gbArgs : Array<any> = [cols]
    gbArgs.push(aggs)
    return new QueryExp('groupBy', gbArgs, [this])
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

  // join to another QueryExp
  join (qexp: QueryExp, on: string|Array<string>, joinType: JoinType = 'LeftOuter'): QueryExp {
    const onArg = (typeof on === 'string') ? [on] : on
    return new QueryExp('join', [joinType, onArg], [this, qexp])
  }

  toSql (tableMap: TableInfoMap, offset: number = -1,
        limit: number = -1): string {
    return ppSQLQuery(queryToSql(tableMap, this), offset, limit)
  }

  toCountSql (tableMap: TableInfoMap): string {
    return ppSQLQuery(queryToCountSql(tableMap, this), -1, -1)
  }

  getSchema (tableMap: TableInfoMap): Schema {
    return getQuerySchema(tableMap, this)
  }
}

const reviverMap = {
  'ColRef': v => new ColRef(v.colName),
  'ConstVal': v => new ConstVal(v.val),
  'BinRelExp': v => new BinRelExp(v.op, v.lhs, v.rhs),
  'UnaryRelExp': v => new UnaryRelExp(v.op, v.arg),
  'FilterExp': v => new FilterExp(v.op, v.opArgs),
  'QueryExp': v => new QueryExp(v.operator, v.valArgs, v.tableArgs)
}

const queryReviver = (key:string, val: any): any => {
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

type QueryReq = { query: QueryExp, offset?: number, limit?: number }

export const deserializeQueryReq = (jsonStr: string): QueryReq => {
  const rq = JSON.parse(jsonStr, queryReviver)

  return rq
}

const tableRepReviver = (key:string, val: any): any => {
  let retVal = val
  if (key === 'schema') {
    retVal = new Schema(val.columns, val.columnMetadata)
  }
  return retVal
}

export const deserializeTableRep = (jsonStr: string): TableRep => {
  const rt = JSON.parse(jsonStr, tableRepReviver)

  return rt
}

type GetSchemaFunc = (tableMap: TableInfoMap, query: QueryExp) => Schema
type GetSchemaMap = {[operator: string]: GetSchemaFunc }

const tableGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  return tableMap[query.valArgs[0]].schema
}

const projectGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const inSchema = query.tableArgs[0].getSchema(tableMap)
  const projectCols = query.valArgs[0]
  return new Schema(projectCols, _.pick(inSchema.columnMetadata, projectCols))
}

const groupByGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const [ cols, aggSpecs ] = query.valArgs
  const aggCols : Array<string> = aggSpecs.map(aggSpec => (typeof aggSpec === 'string') ? aggSpec : aggSpec[1])
  const inSchema = query.tableArgs[0].getSchema(tableMap)
  const rs = new Schema(cols.concat(aggCols), inSchema.columnMetadata)

  return rs
}

const filterGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const inSchema = query.tableArgs[0].getSchema(tableMap)
  return inSchema
}

const mapColumnsGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  // TODO: check that all columns are columns of original schema,
  // and that applying cmap will not violate any invariants on Schema....but need to nail down
  // exactly what those invariants are first!

  const cmap: {[colName: string]: ColumnMapInfo} = query.valArgs[0]
  const inSchema: Schema = query.tableArgs[0].getSchema(tableMap)

  let outColumns = []
  let outMetadata = {}
  for (let i = 0; i < inSchema.columns.length; i++) {
    let inColumnId = inSchema.columns[ i ]
    let inColumnInfo = inSchema.columnMetadata[ inColumnId ]
    let cmapColumnInfo = cmap[ inColumnId ]
    if (typeof cmapColumnInfo === 'undefined') {
      outColumns.push(inColumnId)
      outMetadata[ inColumnId ] = inColumnInfo
    } else {
      let outColumnId = cmapColumnInfo.id
      if (typeof outColumnId === 'undefined') {
        outColumnId = inColumnId
      }

      // Form outColumnfInfo from inColumnInfo and all non-id keys in cmapColumnInfo:
      let outColumnInfo = JSON.parse(JSON.stringify(inColumnInfo))
      for (let key in cmapColumnInfo) {
        if (key !== 'id' && cmapColumnInfo.hasOwnProperty(key)) {
          outColumnInfo[ key ] = cmapColumnInfo[ key ]
        }
      }
      outMetadata[ outColumnId ] = outColumnInfo
      outColumns.push(outColumnId)
    }
  }
  const outSchema = new Schema(outColumns, outMetadata)
  return outSchema
}

const mapColumnsByIndexGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  // TODO: try to unify with mapColumns.  Probably means mapColumns will construct an argument to
  // mapColumnsByIndex and use this impl
  const cmap: {[colName: string]: ColumnMapInfo} = query.valArgs[0]
  const inSchema: Schema = query.tableArgs[0].getSchema(tableMap)

  var outColumns = []
  var outMetadata = {}
  for (var inIndex = 0; inIndex < inSchema.columns.length; inIndex++) {
    var inColumnId = inSchema.columns[ inIndex ]
    var inColumnInfo = inSchema.columnMetadata[ inColumnId ]
    var cmapColumnInfo = cmap[ inIndex.toString() ]
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
  return outSchema
}

const concatGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const inSchema: Schema = query.tableArgs[0].getSchema(tableMap)

  return inSchema
}

const extendGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const [colId, columnMetadata] = query.valArgs
  const inSchema: Schema = query.tableArgs[0].getSchema(tableMap)

  return inSchema.extend(colId, columnMetadata)
}

const joinGetSchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const [joinType, on] = query.valArgs
  const [lhs, rhs] = query.tableArgs

  if (joinType !== 'LeftOuter') {
    throw new Error('unsupported join type: ' + joinType)
  }
  const lhsSchema = lhs.getSchema(tableMap)
  const rhsSchema = rhs.getSchema(tableMap)

  const rhsCols = _.difference(rhsSchema.columns,
      _.concat(on, lhsSchema.columns))
  const rhsMeta = _.pick(rhsSchema.columnMetadata, rhsCols)

  const joinCols = _.concat(lhsSchema.columns, rhsCols)
  const joinMeta = _.defaults(lhsSchema.columnMetadata, rhsMeta)

  const joinSchema = new Schema(joinCols, joinMeta)

  return joinSchema
}

const getSchemaMap : GetSchemaMap = {
  'table': tableGetSchema,
  'project': projectGetSchema,
  'groupBy': groupByGetSchema,
  'filter': filterGetSchema,
  'mapColumns': mapColumnsGetSchema,
  'mapColumnsByIndex': mapColumnsByIndexGetSchema,
  'concat': concatGetSchema,
  'sort': filterGetSchema,
  'extend': extendGetSchema,
  'join': joinGetSchema
}

const getQuerySchema = (tableMap: TableInfoMap, query: QueryExp): Schema => {
  const gsf = getSchemaMap[query.operator]
  if (!gsf) {
    throw new Error('getQuerySchema: No implementation for operator \'' + query.operator + '\'')
  }
  return gsf(tableMap, query)
}

/*
 * Note: If query generation become a performance bottleneck, we
 * should ditch the string return value and instead return
 * arrays of strings for a flatmap'ed strjoin
 */

/* AST for generating SQL queries */
type SQLSelectAsExp = { colExp: string, as: string }
type SQLSelectColExp = string | SQLSelectAsExp
type SQLSortColExp = { col: string, asc: boolean }
type SQLFromJoin = { kind: 'join', joinType: JoinType, lhs: SQLQueryAST, rhs: SQLQueryAST }
type SQLFromQuery = { kind: 'query', query: SQLQueryAST }
type SQLSelectAST = {
  selectCols: Array<SQLSelectColExp>,
  from: string|SQLFromQuery|SQLFromJoin,
  on?: Array<string>,
  where: string,
  groupBy: Array<string>,
  orderBy: Array<SQLSortColExp>
}
type SQLQueryAST = { selectStmts: Array<SQLSelectAST> } // all underliers combined via `union all`

/* An array of strings that will be joined with Array.join('') to
 * form a final result string
 */
type StringBuffer = Array<string>

/**
 * get Column Id from a SQLSelectColExp -- essential when hoisting column names from
 * subquery
 */
const getColId = (cexp: SQLSelectColExp): string => {
  return (typeof cexp === 'string') ? cexp : cexp.as
}

/*
 * not-so-pretty print a SQL query
 */
const ppSelColExp = (exp: SQLSelectColExp): string => {
  if (typeof exp === 'string') {
    return quoteCol(exp)
  }
  return `${exp.colExp} as ${quoteCol(exp.as)}`
}

const ppSortColExp = (exp: SQLSortColExp): string => {
  const optDescStr = exp.asc ? '' : ' desc'
  return `${quoteCol(exp.col)}${optDescStr}`
}

const ppOut = (dst: StringBuffer, depth: number, str: string): void => {
  const indentStr = '  '.repeat(depth)
  dst.push(indentStr)
  dst.push(str)
}

const ppSQLSelect = (dst: StringBuffer, depth: number, ss: SQLSelectAST) => {
  const selColStr = ss.selectCols.map(ppSelColExp).join(', ')
  ppOut(dst, depth, `SELECT ${selColStr}\n`)
  ppOut(dst, depth, 'FROM ')
  const fromVal = ss.from
  if (typeof fromVal === 'string') {
    dst.push('\'' + fromVal + '\'\n')
  } else if (fromVal.kind === 'join') {
    // join condition:
    const {lhs, rhs} = fromVal
    dst.push('(\n')
    auxPPSQLQuery(dst, depth + 1, lhs)
    dst.push(') LEFT OUTER JOIN (\n')
    auxPPSQLQuery(dst, depth + 1, rhs)
    dst.push(')\n')
    if (ss.on) {
      const qcols = ss.on.map(quoteCol)
      dst.push('USING (' + qcols.join(', ') + ')\n')
    }
  } else {
    dst.push('(\n')
    auxPPSQLQuery(dst, depth + 1, fromVal.query)
    ppOut(dst, depth, ')\n')
  }
  if (ss.where.length > 0) {
    ppOut(dst, depth, `WHERE ${ss.where}\n`)
  }
  if (ss.groupBy.length > 0) {
    const gbStr = ss.groupBy.map(quoteCol).join(', ')
    ppOut(dst, depth, `GROUP BY ${gbStr}\n`)
  }
  if (ss.orderBy.length > 0) {
    const obStr = ss.orderBy.map(ppSortColExp).join(', ')
    ppOut(dst, depth, `ORDER BY ${obStr}\n`)
  }
}

// internal, recursive function:
const auxPPSQLQuery = (dst: StringBuffer, depth: number, query: SQLQueryAST) => {
  query.selectStmts.forEach((selStmt, idx) => {
    ppSQLSelect(dst, depth, selStmt)
    if (idx < (query.selectStmts.length - 1)) {
      ppOut(dst, depth, 'UNION ALL\n')
    }
  })
}

// external (top-level) function:
const ppSQLQuery = (query: SQLQueryAST, offset: number, limit: number): string => {
  let strBuf = []
  auxPPSQLQuery(strBuf, 0, query)
  if (offset !== -1) {
    ppOut(strBuf, 0, 'LIMIT ')
    ppOut(strBuf, 0, limit.toString())
    ppOut(strBuf, 0, ' OFFSET ')
    ppOut(strBuf, 0, offset.toString())
    ppOut(strBuf, 0, '\n')
  }
  const retStr = strBuf.join('')
  return retStr
}

type GenSQLFunc = (tableMap: TableInfoMap, q: QueryExp) => SQLQueryAST
type GenSQLMap = {[operator: string]: GenSQLFunc }

const tableQueryToSql = (tableMap: TableInfoMap, tq: QueryExp): SQLQueryAST => {
  const tableName = tq.valArgs[0]
  const schema = tableMap[tableName].schema
  // apparent Flow bug request Array<any> here:
  const selectCols: Array<any> = schema.columns
  const sel = {selectCols, from: tableName, where: '', groupBy: [], orderBy: []}
  return { selectStmts: [sel] }
}

const quoteCol = (cid) => '"' + cid + '"'

// Gather map by column id of SQLSelectColExp in a SQLSelectAST
const selectColsMap = (selExp: SQLSelectAST): {[cid: string]: SQLSelectColExp} => {
  let ret = {}
  for (let cexp of selExp.selectCols) {
    ret[getColId(cexp)] = cexp
  }
  return ret
}

const projectQueryToSql = (tableMap: TableInfoMap, pq: QueryExp): SQLQueryAST => {
  const projectCols = pq.valArgs[0]
  const sqsql = queryToSql(tableMap, pq.tableArgs[0])

  // rewrite an individual select statement to only select projected cols:
  const rewriteSel = (sel: SQLSelectAST): SQLSelectAST => {
    const colsMap = selectColsMap(sel)
    const outCols = projectCols.map(cid => {
      let outCol = colsMap[cid]
      if (outCol === undefined) {
        const sqStr = ppSQLQuery(sqsql, -1, -1)
        throw new Error('projectQueryToSql: no such column ' + quoteCol(cid) + ' in subquery:  ' + sqStr)
      }
      return outCol
    })
    return _.defaults({selectCols: outCols}, sel)
  }
  return { selectStmts: sqsql.selectStmts.map(rewriteSel) }
}

const defaultAggs = {
  'integer': 'sum',
  'real': 'sum',
  'text': 'uniq',
  'boolean': 'uniq',
  'null': 'uniq'
}

export const defaultAggFn = (colType: ColumnType): AggFn => defaultAggs[colType]

const groupByQueryToSql = (tableMap: TableInfoMap, query: QueryExp): SQLQueryAST => {
  const [ cols, aggSpecs ] = query.valArgs
  const inSchema = query.tableArgs[0].getSchema(tableMap)

  // emulate the uniq and null aggregation functions:
  const genUniq = (aggStr, qcid) => `case when min(${qcid})=max(${qcid}) then min(${qcid}) else null end`
  const genNull = (aggStr, qcid) => 'null'
  const genAgg = (aggStr, qcid) => aggStr + '(' + qcid + ')'

  // Get the aggregation expressions for each aggCol:
  const aggExprs = aggSpecs.map(aggSpec => {
    let aggStr
    let cid
    if (typeof aggSpec === 'string') {
      cid = aggSpec
      const colType = inSchema.columnType(cid)
      aggStr = defaultAggs[colType]
    } else {
      [aggStr, cid] = aggSpec
    }
    const aggFn = (aggStr === 'uniq') ? genUniq : (aggStr === 'null') ? genNull : genAgg
    return { colExp: aggFn(aggStr, quoteCol(cid)), as: cid }
  })

  const selectCols = cols.concat(aggExprs)
  const sqsql = queryToSql(tableMap, query.tableArgs[0])

  // If sub-query is just a single select with no group by
  // and where every select expression a simple column id
  // we can rewrite it:
  let retSel
  const subSel = sqsql.selectStmts[0]
  if (sqsql.selectStmts.length === 1 &&
      _.every(subSel.selectCols, sc => (typeof sc === 'string')) &&
      subSel.where.length === 0 &&
      subSel.groupBy.length === 0 &&
      subSel.orderBy.length === 0
    ) {
    retSel = _.defaults({ selectCols, groupBy: cols }, subSel)
  } else {
    const from = { kind: 'query', query: sqsql }
    retSel = { selectCols, from, groupBy: cols, where: '', orderBy: [] }
  }
  return { selectStmts: [ retSel ] }
}

const filterQueryToSql = (tableMap: TableInfoMap, query: QueryExp): SQLQueryAST => {
  const fexp : FilterExp = query.valArgs[0]
  const sqsql = queryToSql(tableMap, query.tableArgs[0])

  const whereStr = fexp.toSqlWhere()

  // If subquery just a single select with no where or groupBy clause, just add one:
  const subSel = sqsql.selectStmts[0]
  let retSel
  if (sqsql.selectStmts.length === 1 &&
      subSel.where.length === 0 &&
      subSel.groupBy.length === 0
      ) {
    retSel = _.defaults({ where: whereStr }, subSel)
  } else {
    const selectCols = subSel.selectCols.map(getColId)
    const from = { kind: 'query', query: sqsql }
    retSel = { selectCols, from, where: whereStr, groupBy: [], orderBy: [] }
  }

  return { selectStmts: [ retSel ] }
}

/*
 * Note: this implements both mapColumns and mapColumsByIndex
 */
const mapColumnsQueryToSql = (byIndex: boolean) => (tableMap: TableInfoMap, query: QueryExp): SQLQueryAST => {
  const cMap = query.valArgs[0]
  const sqsql = queryToSql(tableMap, query.tableArgs[0])

  // apply renaming to invididual select expression:
  const applyColRename = (cexp: SQLSelectColExp, index: number): SQLSelectColExp => {
    const inCid = (typeof cexp === 'string') ? cexp : cexp.as
    const mapKey = byIndex ? index.toString() : inCid
    const outCid = cMap.hasOwnProperty(mapKey) ? cMap[mapKey].id : inCid
    if (typeof cexp === 'string') {
      return { colExp: quoteCol(cexp), as: outCid }
    }
    // Otherwise it's a SQLSelectAsExp -- apply rename to 'as' part:
    return { colExp: cexp.colExp, as: outCid }
  }

  // rewrite an individual select statement by applying rename mapping:
  const rewriteSel = (sel: SQLSelectAST): SQLSelectAST => {
    const selectCols = sel.selectCols.map(applyColRename)
    return _.defaults({selectCols}, sel)
  }
  const ret = { selectStmts: sqsql.selectStmts.map(rewriteSel) }
  return ret
}

const concatQueryToSql = (tableMap: TableInfoMap, query: QueryExp): SQLQueryAST => {
  const sqSqls = query.tableArgs.map(tq => queryToSql(tableMap, tq))
  const allSelStmts = sqSqls.map(q => q.selectStmts)

  return { selectStmts: _.flatten(allSelStmts) }
}

const sortQueryToSql = (tableMap: TableInfoMap, query: QueryExp): SQLQueryAST => {
  const sqsql = queryToSql(tableMap, query.tableArgs[0])
  const orderBy = query.valArgs[0].map(([col, asc]) => ({ col, asc }))

  // If subquery just a single select with no orderBy clause, just add one:
  const subSel = sqsql.selectStmts[0]
  let retSel
  if (sqsql.selectStmts.length === 1 &&
      subSel.orderBy.length === 0) {
    retSel = _.defaults({ orderBy }, subSel)
  } else {
    let selectCols = subSel.selectCols.map(getColId)
    const from = { kind: 'query', query: sqsql }
    retSel = { selectCols, from, where: '', groupBy: [], orderBy }
  }

  return { selectStmts: [ retSel ] }
}

/*
const intRE = /^[-+]?[$]?[0-9,]+$/
const strLitRE = /^'[^']*'$/
const nullRE = /^null$/
*/
const litRE = /^[-+]?[$]?[0-9,]+$|^'[^']*'$|^null$/
/*
 * determine if extend expression is a constant expression, so that
 * we can inline the extend expression.
 *
 * Conservative approximation -- true => constant expr, but false may or may not be constant
 *
 * Only returns true for simple literal exprs for now; should expand to handle binary ops
 */
const isConstantExpr = (expr: string): boolean => {
  const ret = litRE.test(expr)
/*
  const selExp = `select (${expr})`
  const selPtree = sqliteParser(selExp)
  const expPtree = selPtree.statement[0].result[0]
  const ret = (expPtree.type === 'literal')
*/
  return ret
}

const extendQueryToSql = (tableMap: TableInfoMap, query: QueryExp): SQLQueryAST => {
  const as = query.valArgs[0]
  const colExp = query.valArgs[2]
  const sqsql = queryToSql(tableMap, query.tableArgs[0])

  const subSel = sqsql.selectStmts[0]
  // Note: We only want to extract the column ids from subquery for use at this level; we
  // want to skip any calculated expressions or aggregate functions

  const isConst = isConstantExpr(colExp)
  let retSel
  if (isConst && sqsql.selectStmts.length === 1) {
    // just append our column to existing selectCols list:
    const outSel = subSel.selectCols.slice()
    outSel.push({ colExp, as })
    retSel = _.defaults({ selectCols: outSel }, subSel)
  } else {
    let selectCols = subSel.selectCols.map(getColId)
    selectCols.push({ colExp, as })
    const from = { kind: 'query', query: sqsql }
    retSel = { selectCols, from, where: '', groupBy: [], orderBy: [] }
  }
  return { selectStmts: [ retSel ] }
}

const joinQueryToSql = (tableMap: TableInfoMap, query: QueryExp): SQLQueryAST => {
  const [joinType, on] = query.valArgs
  const [lhsQuery, rhsQuery] = query.tableArgs

  const lhs = queryToSql(tableMap, lhsQuery)
  const rhs = queryToSql(tableMap, rhsQuery)

  const outSchema = query.getSchema(tableMap)
  // any type here is flow bug workaround
  const selectCols: Array<any> = outSchema.columns
  const from = { kind: 'join', joinType, lhs, rhs }
  const retSel = { selectCols, from, on, where: '', groupBy: [], orderBy: [] }
  return { selectStmts: [ retSel ] }
}

const genSqlMap: GenSQLMap = {
  'table': tableQueryToSql,
  'project': projectQueryToSql,
  'groupBy': groupByQueryToSql,
  'filter': filterQueryToSql,
  'mapColumns': mapColumnsQueryToSql(false),
  'mapColumnsByIndex': mapColumnsQueryToSql(true),
  'concat': concatQueryToSql,
  'sort': sortQueryToSql,
  'extend': extendQueryToSql,
  'join': joinQueryToSql
}

const queryToSql = (tableMap: TableInfoMap, query: QueryExp): SQLQueryAST => {
  const gen = genSqlMap[query.operator]
  if (!gen) {
    throw new Error('queryToSql: No implementation for operator \'' + query.operator + '\'')
  }
  const ret = gen(tableMap, query)
  return ret
}

// Generate a count(*) as rowCount wrapper around a query:
const queryToCountSql = (tableMap: TableInfoMap, query: QueryExp): SQLQueryAST => {
  const sqsql = queryToSql(tableMap, query)
  const colExp = 'count(*)'
  const as = 'rowCount'
  const selectCols = [{ colExp, as }]
  const from = { kind: 'query', query: sqsql }
  const retSel = { selectCols, from, where: '', groupBy: [], orderBy: [] }
  return { selectStmts: [ retSel ] }
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

export type ColumnMetaMap = {[colId: string]: ColumnMetadata}

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
    const md = this.columnMetadata[ colId ]
    const dn = (md && md.displayName) || colId
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

  // calculate extension of this schema (as in extend query):
  extend (colId: string, columnMetadata: ColumnMetadata): Schema {
    var outCols = this.columns.concat([colId])
    let cMap = {}
    cMap[colId] = columnMetadata
    var outMetadata = _.extend(cMap, this.columnMetadata)
    var outSchema = new Schema(outCols, outMetadata)

    return outSchema
  }
}

export type TableInfo = { tableName: string, schema: Schema }
export type TableInfoMap = { [tableName: string]: TableInfo }

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
    return this.rowData.map(r => r[columnId])
  }
}

export interface Connection { // eslint-disable-line
  evalQuery (query: QueryExp, offset?: number, limit?: number): Promise<TableRep>;
  rowCount (query: QueryExp): Promise<number>
}
