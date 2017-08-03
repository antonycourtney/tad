import Field from './Field'
import Dialect from './Dialect'
import { FieldMap, FieldMetadata, ColumnType } from '../base'

const _ = require('lodash')

class SchemaError {
  message: string
  rest: Array<any>

  constructor (message: string, ...rest: Array<any>) {
    this.message = message
    this.rest = rest
  }
}

class Schema {
  fieldMap: FieldMap
  fieldIdMap: FieldMap
  columns: Array<string>
  fields: Array<Field>
  columnIndices:{[colId: string]: number}
  _sortedFields: ?Array<Field>
  static dialect: Dialect

  // Don't know why flow is bugged out here.
  constructor (fields: Array<Field | FieldMetadata>) {
    this.fields = fields.map((f: FieldMetadata | Field): Field => {
      if (f instanceof Field) {
        return f
      }

      return new this.constructor.dialect.Field(f)
    })

    // These two are mostly only used by GridPane.
    this.columns = this.fields.map(f => f.selectableName)
    this.fieldMap = _.keyBy(this.fields, f => f.selectableName)
    this.fieldIdMap = _.keyBy(this.fields, f => f.id)

    this._sortedFields = null
  }

  columnType (colId: string): ColumnType {
    return this.getField(colId).type || 'text'
  }

  displayName (colId: string): string {
    const md = this.fieldMap[ colId ]
    const dn = (md && md.displayName) || colId
    return dn
  }

  getField (colId: string): Field {
    const errMsg = `Column "${colId}" does not exist in schema`
    if (!colId) {
      throw new Error(errMsg)
    }

    // Check both name and id
    const field = this.fieldIdMap[ `${colId}` ] || this.fieldMap[ `${colId}` ]
    if (!field) {
      throw new Error(errMsg)
    }

    return field
  }

  compatCheck (sb: Schema): boolean {
    if (this.columns.length !== sb.columns.length) {
      throw new SchemaError('incompatible schema: columns length mismatch', this, sb)
    }
    for (var i = 0; i < this.columns.length; i++) {
      var colName = this.columns[ i ]
      var bColName = sb.columns[ i ]
      if (colName !== bColName) {
        throw new SchemaError("incompatible schema: expected '" + colName + "', found '" + bColName + "'", this, sb)
      }
      var colType = this.fieldMap[ colName ].type || ''
      var bColType = sb.fieldMap[ bColName ].type || ''
      if (colType !== bColType) {
        throw new SchemaError("mismatched column types for col '" + colName + "': " + colType + ', ' + bColType, this, sb)
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
  extend (colName: string, fieldMap: FieldMetadataModifier): Schema {
    const field = {
      name: colName,
      ...fieldMap
    }

    return new this.constructor.dialect.Schema(this.fields.concat([field]))
  }

  // returned an array of column ids in locale-sorted order
  // cached lazily
  sortedFields (): Array<Field> {
    let sc = this._sortedFields
    if (sc == null) {
      sc = this.fields.slice()
      sc.sort((field1, field2) =>
        field1.displayName.localeCompare(field2.displayName))
      this._sortedFields = sc
    }
    return sc
  }
}

export default Schema
