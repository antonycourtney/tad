/* @flow */

import FuncArg from './base/FuncArg'
import Func from './base/Func'
import Field from './base/Field'
import Filter, { InvalidFilterError } from './base/Filter'
import Condition from './base/Condition'
import Schema from './base/Schema'
import Dialect from './base/Dialect'
import QueryExp from './base/QueryExp'
import TableRep from './base/TableRep'

/* eslint-disable no-use-before-define */

export type AggFn = string
export type ColumnType = string

export type Scalar = ?number | ?string | ?boolean

// displayName is name if not present, type is text
export type FieldMetadata = { name: string, displayName?: string, type?: ColumnType, agg?: string }

/*
 * A ColumnExtendVal is either a simple scalar or a function from a row object
 * to a scalar.
 */
export type ColumnExtendVal = Scalar | Field // eslint-disable-line

/*
 * Could almost use an intersection type of {id,type} & FieldMetadata, but
 * properties are all optional here
 */
export type FieldMetadataModifier = {name?: string, type?: ColumnType, displayName?: string}

export type TableInfo = { tableName: string, schema: Schema }
export type TableInfoMap = { [tableName: string]: TableInfo }

export type FieldMap = {[colId: string]: Field}

export interface Connection { // eslint-disable-line
  evalQuery (query: QueryExp, offset?: number, limit?: number): Promise<TableRep>;
  rowCount (query: QueryExp): Promise<number>
}

export {
  FuncArg,
  Func,
  Field,
  Filter,
  Condition,
  Dialect,
  QueryExp,
  Schema,
  TableRep,
  InvalidFilterError
}
