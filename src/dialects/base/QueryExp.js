import { Record, List } from 'immutable'
import JsonSql from 'json-sql'
import Dialect from './Dialect'
import Schema from './Schema'
import Field from './Field'
import Condition from './Condition'
import { FieldMetadataModifier, ColumnExtendVal, Scalar } from '../base'
import jsonify from './jsonify'

const _ = require('lodash')

// Join types:  For now: only left outer
export type JoinType = 'left' | 'right' | 'inner'

let aliasIndex = 0
const genAlias = (): string => `alias_${aliasIndex++}`

type JsonSqlQuery = { query: string, values: Array<any> }

class QueryExp extends Record({
  type: undefined,
  limit: undefined,
  offset: undefined,
  table: undefined,
  query: undefined,
  queries: undefined,
  fields: List(),
  join: undefined,
  sort: undefined,
  group: undefined,
  on: undefined,
  expType: 'Query',
  alias: undefined,
  condition: undefined,
  all: undefined
}) {
  type: string
  limit: number
  offset: number
  table: string
  query: QueryExp
  queries: List<QueryExp>
  fields: List<Field>
  join: List<QueryExp>
  sort: { [colId: string]: number }
  group: List<Field>
  on: Object
  expType: string
  alias: string
  condition: Condition
  all: boolean
  static dialect: Dialect
  static jsonSql: JsonSql

  // Extracts fields from a previous query for use in a new one with this table
  static extendFields ({ fields, table } : { fields: List<Field>, table: string }) : List<Field> {
    return fields.map(field =>
      new this.dialect.Field({
        ...field.toJS(),
        // TODO: Investigate why everything can't use fully qualified aliases?
        table: field.isHidden() ? table : undefined,
        // This is a new select. So select what the field would have been called in
        //   the inner query
        name: field.selectableName,
        // Expressions, functions, values were already evaluated. Just select them
        func: undefined,
        expression: undefined,
        value: undefined
      })
    )
  }

  static typeWithPriority (types) {
    if (types.length <= 1) return types[0]

    // For now just cast them as text and hope for the best
    return 'text'

    //if (types.includes('text')) {
    //  return 'text'
    //}
    //
    //throw new Error(`concat: Cannot union types ${types}`)
  }

  static unifyTypes (...fields) {
    // A list of unique types amongst the argument fields
    const types = _(fields).filter(Boolean).map(f => f.type).filter(Boolean).uniq().value()
    const type = this.typeWithPriority(types)

    return fields[0].set('type', type)
  }

  // Combine fields from all subqueries into this one. Effectively a `select *`, but
  // we're being more explicit
  // Subqueries either come from `queries` (union)
  //  or some combination of `query` and `join`
  static getSubqueryFields (
    query : (QueryExp | { alias: string, queries?: List<QueryExp>, join?: List<QueryExp>, query: QueryExp })
  ): List<Field> {
    let fields = List()

    let subqueries = List()
    if (query.queries) {
      subqueries = subqueries.concat(query.queries)
    }

    if (query.query) {
      subqueries = subqueries.push(query.query)
    }

    // The reason we do these next two parts separately is because the following:
    /*
     {
     query: {
     alias: 'fooAlias',
     table: 'foo'
     },
     alias: 'outerAlias'
     join: [{
     query: {
     table: 'bar'
     },
     alias: 'innerAlias'
     }]
     }

     translates to:

     select * from (select * from foo as fooAlias) as outerAlias join (select * from bar) as innerAlias

     Which means the things in `query` or `queries` should reference outerAlias,
     while the things in `join` should reference `innerAlias`
     */
    const extendedFieldsWithCurrentAlias = subqueries.map(q => q.selectableFields(query.alias)).flatten(true)
    fields = fields.concat(extendedFieldsWithCurrentAlias)

    if (query.join) {
      const extendedFieldsWithJoinAlias = query.join.map(q => q.fields).flatten(true)
      fields = fields.concat(extendedFieldsWithJoinAlias)
    }

    // We want each field to be unique _and_ have type information on it
    // When someone does an extend with a value `null`, postgres assumes it is text.
    // This is usually something like _path0, which gets cast later on.
    // When we do a join, if we only take the first Field named _path0, we might lose the cast information
    // from the second side of the join's _path0. This is why we must unify the types of every field found in a join
    // and also make sure they are compatable.

    // Unify the types of each group of fields of a given selectableName
    const uniqFields = _(fields.toArray())
      .groupBy(f => f.selectableName)
      .toPairs()
      .map(([k, fieldGroup]) => this.unifyTypes(...fieldGroup))
      .value()
    return List(uniqFields)
  }

  constructor (params: Object) {
    // ensure fields is always a list of fields (when reviving it might not be)
    if (!params.fields || !(params.fields instanceof List)) {
      params.fields = List(params.fields)
    }

    if (params.join && !(params.join instanceof List)) {
      params.join = List(params.join)
    }

    // Ensure there's always an alias for subqueries
    if (params.query) {
      params.alias = params.alias || genAlias()
    }

    const fields = params.fields
    if (!fields.get(0)) {
      // eslint-disable-next-line no-this-before-super
      params.fields = QueryExp.getSubqueryFields(params)
    }

    super(params)
  }

  distinct (field: Field) {
    return new this.constructor.dialect.QueryExp({
      query: this,
      fields: [
        field.aggregate('distinct').set('cast', undefined)
      ]
    })
  }

  // Get a selectable form of this subquery's fields targeting the specified table
  selectableFields (table: string = this.selectableName): List<Field> {
    return this.constructor.dialect.QueryExp.extendFields({ fields: this.fields, table })
  }

  static get selectableName () {
    return this.alias || this.table
  }

  filterSelectableFields (fields: Array<string | Field>, table: string = this.selectableName): List<Field> {
    const selectableFields = this.selectableFields(table)

    return List(
      fields.map((colOrField) => {
        const fName = colOrField instanceof Field ? colOrField.selectableName : colOrField
        const field = selectableFields.find(f => f.selectableName === fName)

        if (field == null || !field.selectableName) {
          throw new Error(`Column "${colOrField}" not found in query, should be one of ${selectableFields.map(f => f.selectableName)}`)
        }

        return field
      })
    )
  }

  // operator chaining methods:
  project (fields: Array<string | Field>): QueryExp {
    const alias = genAlias()
    return new this.constructor.dialect.QueryExp({
      query: this,
      alias,
      fields: this.filterSelectableFields(fields, alias)
    })
  }

  groupBy (groupCols: Array<string | Field>, aggFields: Array<Field>): QueryExp {
    // When we pull out the grouped columns into this new query, using this as a subquery,
    //   they need to properly reference the table they are coming from.
    const alias = genAlias()
    const groupFields = this.filterSelectableFields(groupCols, alias)

    // All of the agg columns fields
    const fields = List([
      ...groupFields,
      ...aggFields.map(field => field.isAggregated() ? field : field.aggregate())
    ])

    return new this.constructor.dialect.QueryExp({
      query: this,
      group: groupFields.map(f => alias + '.' + f.selectableName),
      fields,
      alias
    })
  }

  filter (condition: Condition): QueryExp {
    if (this.condition) {
      return new this.constructor.dialect.QueryExp({ query: this, condition })
    }

    return this.set('condition', condition)
  }

  mapColumns (cmap: {[colName: string]: FieldMetadataModifier}): QueryExp {
    let newThis = this.set('fields', this.fields.map(field =>
      cmap.hasOwnProperty(field.selectableName)
        ? new this.constructor.dialect.Field({
        ...field.toObject(),
        type: cmap[field.selectableName].type || field.type,
        name: field.selectableName,
        alias: cmap[field.name].name,
        displayName: cmap[field.name].displayName
      }) : field
    ))

    return newThis
  }

  // colIndex is a string here because Flow doesn't support non-string keys in object literals
  mapColumnsByIndex (cmap: {[colIndex: (string|number)]: FieldMetadataModifier}): QueryExp {
    let newThis = this.set('fields', this.fields.map((field, index) =>
      cmap.hasOwnProperty(index)
        ? new this.constructor.dialect.Field({
        ...field.toObject(),
        type: cmap[index].type || field.type,
        name: field.selectableName,
        alias: cmap[index].name,
        displayName: cmap[index].displayName
      }) : field
    ))

    return newThis
  }

  // Make sure all fields are explicitly cast as the same time to ensure union compatability
  explicitlyCastForUnion (fields: List<Field>) {
    // Faster to access by hash than to do a `find` for every field
    const fieldsByName = _.keyBy(fields.toArray(), f => f.selectableName)

    // Note: Do NOT use this.set('fields') for this. Fields are unused in a union all query.
    // What we're doing here is creating a subquery that explicitly selects properly typed
    // columns from both sides of the union
    const alias = genAlias()
    return new this.constructor.dialect.QueryExp({
      query: this,
      alias,
      fields: this.constructor.dialect.QueryExp.extendFields({
        fields: this.fields.map((field) =>
          this.constructor.unifyTypes(field, fieldsByName[field.selectableName])
        ),
        table: alias
      })
    })
  }

  concat (qexp: QueryExp): QueryExp {
    const unionLeft = this.explicitlyCastForUnion(qexp.fields)
    const unionRight = qexp.explicitlyCastForUnion(unionLeft.fields)

    return new this.constructor.dialect.QueryExp({
      type: 'union',
      all: true,
      queries: List([unionLeft, unionRight])
    })
  }

  sortBy (keys: Array<[Field | string, boolean]>): QueryExp {
    const sort = {}
    keys.forEach((key) => {
      const [field, isAsc] = key
      const selectableName = field instanceof Field ? field.selectableName : field
      sort[selectableName] = isAsc ? 1 : -1
    })

    if (this.sort) {
      return new this.constructor.dialect.QueryExp({ query: this, sort })
    }

    return this.set('sort', sort)
  }

  // extend by adding a single column
  extend (colName: string, fieldMap: FieldMetadataModifier, colVal: ColumnExtendVal): QueryExp {
    const baseSettings = {
      alias: colName,
      displayName: fieldMap.displayName,
      type: fieldMap.type
    }

    // Must cast null as text or postgres will choke on it as 'unknown' in unionAll queries
    if (colVal === null) {
      baseSettings.type = 'text'
    }

    // Trying to extend with a field.
    let newFieldSettings
    if (colVal && colVal instanceof Field) {
      // Ensure the field has all the current type info and exists in current query
      const field = this.selectableFields().find(f => f.selectableName === colVal.selectableName)

      if (!field) {
        throw new Error(`extend: Cannot extend with field ${colVal} that doesn't exist in query`)
      }

      newFieldSettings = {
        ...jsonify(field),
        ...jsonify(baseSettings) // jsonifying here removes undefines which could set type: undefined
      }
    } else {
      newFieldSettings = {
        ...baseSettings,
        name: colName,
        value: colVal
      }
    }

    return this.set('fields', this.fields.push(
      new this.constructor.dialect.Field(newFieldSettings)
    ))
  }

  getJoinField (fieldSelectableName: string, table: string) {
    let field = this.filterSelectableFields([fieldSelectableName], table).get(0)

    if (!field) {
      throw new Error(`getJoinField: Cannot join on field ${fieldSelectableName}, field does not exist in this query`)
    }

    // Cannot have `as` in a join clause. Should be selecting the selectableName with no alias
    if (field.alias) {
      field = field.set('name', field.selectableName).set('alias', undefined)
    }

    return field
  }

  // join to another QueryExp
  join (qexp: QueryExp, on: string|Array<string>, joinType: JoinType = 'left'): QueryExp {
    const onArr = _.isArray(on) ? on : [on]

    // Create a join with this as the lhs, qexp as the rhs, joined by their field names qualified by alias and casted
    // by the field's cast
    const innerAlias = genAlias()
    const outerAlias = genAlias()

    const onWithFields = onArr.map((subOn) => {
      const leftField = this.getJoinField(subOn, outerAlias)
      const rightField = qexp.getJoinField(subOn, innerAlias)
      const type = rightField.type || leftField.type

      // Make sure to set expType: undefined. We never want to treat these as fields.
      // Unify type so that these fields are explicitly cast as the same type
      // in the join
      return {
        $field: {
          ...leftField.toJS(),
          cast: type,
          $eq: { $field: { ...rightField.toJS(), cast: type } },
          expType: undefined
        }
      }
    });

    return new this.constructor.dialect.QueryExp({
      query: this,
      alias: outerAlias,
      join: List([new this.constructor.dialect.QueryExp({
        type: joinType,
        on: onWithFields,
        alias: innerAlias,
        query: qexp.set('type', undefined)
      })])
    })
  }


  // For serializing
  toJS () {
    return jsonify(super.toJS())
  }

  toJSON () {
    return this.toJS()
  }

  toSql (offset: number,
         limit: number): JsonSqlQuery {
     //const util = require('util')
     //console.log(util.inspect(this.toJS(), {showHidden: false, depth: null}))
     //console.log(this.constructor.jsonSql.build(this.toJS()))
    const withLimitOffset = this.set('limit', limit).set('offset', offset)
    return this.constructor.jsonSql.build(withLimitOffset.toJS())
  }

  toCountSql (): JsonSqlQuery {
    const countField = new this.constructor.dialect.Field({
      name: 'rowCount',
      alias: 'rowCount',
      func: new this.constructor.dialect.Func({
        name: 'count',
        args: [
          new this.constructor.dialect.FuncArg({field: '*'})
        ]
      })
    })

    return new this.constructor.dialect.QueryExp({ query: this, fields: [countField] }).toSql()
  }

  getSchema (): Schema {
    return new this.constructor.dialect.Schema(this.fields.toArray())
  }
}

export default QueryExp
