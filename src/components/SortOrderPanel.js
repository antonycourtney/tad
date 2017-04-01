/* @flow */

import * as React from 'react'
import ColumnList from './ColumnList'
import { ColumnListType } from './constants'
import { Schema } from '../reltab'
import ViewParams from '../ViewParams'
import * as actions from '../actions'

const dirSelect = (viewParams: ViewParams, schema: Schema, cid: string, asc: boolean, updater: any) => {
  const handleChange = (event) => {
    const asc = (event.target.value === 'asc')
    actions.setSortDir(cid, asc, updater)
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

const sortKeyRowFormatter = (viewParams: ViewParams, stateRefUpdater: any) => (schema: Schema, row: [string, boolean]) => {
  const [cid, asc] = row
  const displayName = schema.displayName(cid)
  const select = dirSelect(viewParams, schema, cid, asc, stateRefUpdater)
  return ([
    <td key={cid} className='col-colName'>{displayName}</td>,
    <td key={'sortDir-' + cid}>{select}</td>
  ])
}

export default class SortOrderPanel extends React.Component {
  render () {
    const {viewParams, stateRefUpdater} = this.props  //eslint-disable-line

    return (
      <div className='ui-block'>
        <h6>Sort Columns <small className='ui-subtext'>(drag to reorder)</small></h6>
        <ColumnList
          schema={this.props.baseSchema}
          columnListType={ColumnListType.SORT}
          headerLabels={['Sort Dir']}
          items={viewParams.sortKey}
          rowFormatter={sortKeyRowFormatter(viewParams, stateRefUpdater)}
          stateRefUpdater />
      </div>
    )
  }
}
