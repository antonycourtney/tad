/* @flow */

import * as React from 'react'
import * as actions from '../actions'

export default class ColumnSelector extends React.Component {
  renderColumnRow (cid: string) {
    const appState = this.props.appState
    const schema = appState.baseSchema
    const displayName = schema.displayName(cid)
    const isShown = appState.displayColumns.includes(cid)
    const isPivot = appState.vpivots.includes(cid)
    const isSort = appState.sortKey.includes(cid)
    const refUpdater = this.props.stateRefUpdater
    return (
      <tr key={cid}>
        <td className='col-colName'>{displayName}</td>
        <td className='col-check'>
          <input
            className='colSel-check'
            type='checkbox'
            title='Show this column'
            ref={'showCheckbox-' + cid}
            onChange={() => actions.toggleShown(cid, refUpdater)}
            checked={isShown} />
        </td>
        <td className='col-check'>
          <input
            className='colSel-check'
            type='checkbox'
            title='Pivot by column'
            ref={'pivotCheckbox-' + cid}
            onChange={() => actions.togglePivot(cid, refUpdater)}
            checked={isPivot} />
        </td>
        <td className='col-check'>
          <input
            className='colSel-check'
            type='checkbox'
            title='Sort by column'
            ref={'sortCheckbox-' + cid}
            onChange={() => actions.toggleSort(cid, refUpdater)}
            checked={isSort} />
        </td>
      </tr>
    )
  }

  render () {
    const appState = this.props.appState
    const schema = appState.baseSchema
    const columnIds = schema.columns.slice()
    columnIds.sort((cid1, cid2) => schema.displayName(cid1).localeCompare(schema.displayName(cid2)))
    const columnRows = columnIds.map(cid => this.renderColumnRow(cid))

    return (
      <div className='column-selector'>
        <div className='column-selector-header'>
          <table className='table table-condensed table-hover column-selector-table'>
            <thead>
              <tr>
                <th className='column-selector-th col-colName'>Column</th>
                <th className='column-selector-th col-check'>Show</th>
                <th className='column-selector-th col-check'>Pivot</th>
                <th className='column-selector-th col-check'>Sort</th>
              </tr>
            </thead>
          </table>
        </div>
        <div className='column-selector-body'>
          <table className='table table-condensed table-hover column-selector-table'>
            <tbody>
              {columnRows}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
}
