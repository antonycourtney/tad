/* @flow */

import * as React from 'react'
import ColumnList from './ColumnList'
import { ColumnListType } from './constants'
import { Field, Dialect } from '../dialects/base'
import ViewParams from '../ViewParams'
import * as actions from '../actions'

const aggSelect = (dialect: Dialect, viewParams: ViewParams, field: Field, updater: any) => {
  const colName = field.selectableName
  const colAggFn = viewParams.getAggFn(field)

  const mkOption = (aggName: string) => {
    const key = 'agg-' + colName + '-' + aggName
    return (
      <option key={key} value={aggName}>{aggName}</option>
    )
  }

  const handleChange = (event) => {
    console.log('agg.handleChange: column: ', field.selectableName, 'new agg: ', event.target.value)
    const aggFn: string = event.target.value
    actions.setAggFn(field, aggFn, updater)
  }

  const aggOptions = field.availableAggFns().map(mkOption)
  return (
    <div className='pt-select pt-minimal'>
      <select value={colAggFn} onChange={handleChange}>
        {aggOptions}
      </select>
    </div>
  )
}

const aggRowFormatter = (dialect: Dialect, viewParams: ViewParams, stateRefUpdater: any) => (schema: any, row: { value: Field }) => {
  const field = row.value
  const displayName = field.displayName
  const select = aggSelect(dialect, viewParams, field, stateRefUpdater)
  const colName = field.selectableName
  return ([
    <td key={colName} className='col-colName'>{displayName}</td>,
    <td key={'aggFn-' + colName} className='aggFn'>
      {select}
    </td>
  ])
}

export default class AggPanel extends React.Component {
  render () {
    const {schema, viewParams, dialect, stateRefUpdater} = this.props  //eslint-disable-line
    const fields = schema.sortedFields()

    return (
      <div className='ui-block'>
        <h6>Aggregation Functions</h6>
        <ColumnList
          schema={schema}
          columnListType={ColumnListType.AGG}
          headerLabels={['Agg Fn']}
          items={fields.map(field => ({ key: field.id, value: field }))}
          rowFormatter={aggRowFormatter(dialect, viewParams, stateRefUpdater)}
          stateRefUpdater={stateRefUpdater} />
      </div>
    )
  }
}
