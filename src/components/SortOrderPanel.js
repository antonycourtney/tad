/* @flow */

import * as React from 'react'
import ColumnList from './ColumnList'
import { ColumnListType } from './constants'
import { Schema } from '../reltab'

const sortKeyRowFormatter = (schema: Schema, row: [string, boolean]) => {
  const [cid, asc] = row
  const displayName = schema.displayName(cid)
  const ascStr = asc ? 'asc' : 'desc'
  return ([
    <td key={cid} className='col-colName'>{displayName}</td>,
    <td key={'sortDir-' + cid}>{ascStr}</td>
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
          rowFormatter={sortKeyRowFormatter}
          stateRefUpdater />
      </div>
    )
  }
}
