/* @flow */

import * as React from 'react'
import * as actions from '../actions'
import IndeterminateCheckbox from './IndeterminateCheckbox'

export default class ColumnSelector extends React.Component {
  renderColumnRow (cid: string) {
    const {schema, viewParams} = this.props
    const displayName = schema.displayName(cid)
    const isShown = viewParams.displayColumns.includes(cid)
    const isPivot = viewParams.vpivots.includes(cid)
    const isSort = (viewParams.sortKey.findIndex(entry => entry[0] === cid) !== -1)
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

  // render row with checkboxes to select / deselect all items:
  renderAllRow () {
    const {schema, viewParams} = this.props
    const allShown = schema.columns.length === viewParams.displayColumns.length
    const someShown = (viewParams.displayColumns.length > 0)
    const refUpdater = this.props.stateRefUpdater
    return (
      <tr className='all-row'>
        <td className='col-colName-all'>All Columns</td>
        <td className='col-check'>
          <IndeterminateCheckbox
            className='colSel-check'
            type='checkbox'
            title='Show all columns'
            ref={'showCheckbox-all'}
            onChange={() => actions.toggleAllShown(refUpdater)}
            checked={allShown}
            indeterminate={!allShown && someShown}
          />
        </td>
        <td className='col-check' />
        <td className='col-check' />
      </tr>
    )
  }

  render () {
    const schema = this.props.schema
    const columnIds = schema.columns.slice()
    columnIds.sort((cid1, cid2) => schema.displayName(cid1).localeCompare(schema.displayName(cid2)))
    const allRow = this.renderAllRow()
    const columnRows = columnIds.map(cid => this.renderColumnRow(cid))

    return (
      <div className='column-selector'>
        <div className='column-selector-header'>
          <table className='table table-condensed pt-interactive column-selector-table'>
            <thead>
              <tr>
                <th className='column-selector-th col-colName'>Column</th>
                <th className='column-selector-th col-check'>Show</th>
                <th className='column-selector-th col-check'>Pivot</th>
                <th className='column-selector-th col-check'>Sort</th>
              </tr>
            </thead>
            <tbody>
              {allRow}
            </tbody>
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
