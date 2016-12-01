/* @flow */

import * as React from 'react'

export default class ColumnSelector extends React.Component {
  renderColumnRow (columnName: string) {
    const isShown = true
    return (
      <tr key={columnName}>
        <td className='col-colName'>{columnName}</td>
        <td className='col-check'>
          <input
            className='colSel-check'
            type='checkbox'
            title='Show this column'
            ref={'showCheckbox-' + columnName}
            checked={isShown} /></td>
        <td className='col-check' />
        <td className='col-check' />
      </tr>
    )
  }

  render () {
    const appState = this.props.appState
    const columnNames = appState.baseSchema.columns.slice()
    columnNames.sort((s1, s2) => s1.localeCompare(s2))
    const columnRows = columnNames.map(colName => this.renderColumnRow(colName))

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
