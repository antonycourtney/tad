/* @flow */

import * as React from 'react'
import ColumnList from './ColumnList'
import { ColumnListType } from './constants'
import { aggFns, Schema } from '../reltab'
import type { AggFn } from '../reltab'  // eslint-disable-line
import ViewParams from '../ViewParams'
import * as actions from '../actions'

const aggSelect = (viewParams: ViewParams, schema: Schema, cid: string, updater: any) => {
  const colAggFn = viewParams.getAggFn(schema, cid)

  const mkOption = (aggName: string) => {
    const key = 'agg-' + cid + '-' + aggName
    return (
      <option key={key} value={aggName}>{aggName}</option>
    )
  }

  const handleChange = (event) => {
    console.log('agg.handleChange: column: ', cid, 'new agg: ', event.target.value)
    const aggFn: AggFn = event.target.value
    actions.setAggFn(cid, aggFn, updater)
  }

  const aggOptions = aggFns(schema.columnType(cid)).map(mkOption)
  return (
    <div className='bp3-select bp3-minimal'>
      <select value={colAggFn} onChange={handleChange}>
        {aggOptions}
      </select>
    </div>
  )
}

const aggRowFormatter = (viewParams: ViewParams, stateRefUpdater: any) => (schema: Schema, cid: string) => {
  const displayName = schema.displayName(cid)
  const select = aggSelect(viewParams, schema, cid, stateRefUpdater)
  return ([
    <td key={cid} className='col-colName'>{displayName}</td>,
    <td key={'aggFn-' + cid} className='aggFn'>
      {select}
    </td>
  ])
}

export default class AggPanel extends React.Component {
  render () {
    const {schema, viewParams, stateRefUpdater} = this.props  //eslint-disable-line
    const columnIds = schema.sortedColumns()

    return (
      <div className='ui-block'>
        <h6>Aggregation Functions</h6>
        <ColumnList
          schema={this.props.schema}
          columnListType={ColumnListType.AGG}
          headerLabels={['Agg Fn']}
          items={columnIds}
          rowFormatter={aggRowFormatter(viewParams, stateRefUpdater)}
          stateRefUpdater={stateRefUpdater} />
      </div>
    )
  }
}
