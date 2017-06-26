/* @flow */

import * as React from 'react'
import ColumnList from './ColumnList'
import { ColumnListType } from './constants'
import { Schema, Field } from '../dialects/base'
import ViewParams from '../ViewParams'
import * as actions from '../actions'

const dirSelect = (viewParams: ViewParams, schema: Schema, field: Field, asc: boolean, updater: any) => {
  const handleChange = (event) => {
    const asc = (event.target.value === 'asc')
    actions.setSortDir(field, asc, updater)
  }

  const selectVal = asc ? 'asc' : 'desc'
  return (
    <div className='pt-select pt-minimal'>
      <select value={selectVal} onChange={handleChange}>
        <option value='asc'>asc</option>
        <option value='desc'>desc</option>
      </select>
    </div>
  )
}

const sortKeyRowFormatter = (viewParams: ViewParams, stateRefUpdater: any) => (schema: Schema, row: { value: [Field, boolean] }) => {
  const [field, asc] = row.value
  const displayName = field.displayName
  const select = dirSelect(viewParams, schema, field, asc, stateRefUpdater)
  return ([
    <td key={field.id} className='col-colName'>{displayName}</td>,
    <td key={'sortDir-' + field.id}>{select}</td>
  ])
}

export default class SortOrderPanel extends React.Component {
  render () {
    const {viewParams, stateRefUpdater} = this.props  //eslint-disable-line

    return (
      <div className='ui-block'>
        <h6>Sort Columns <small className='ui-subtext'>(drag to reorder)</small></h6>
        <ColumnList
          schema={this.props.schema}
          columnListType={ColumnListType.SORT}
          headerLabels={['Sort Dir']}
          items={viewParams.sortKey.map(k => ({ key: k[0].id, value: k }))}
          rowFormatter={sortKeyRowFormatter(viewParams, stateRefUpdater)}
          stateRefUpdater={stateRefUpdater} />
      </div>
    )
  }
}
