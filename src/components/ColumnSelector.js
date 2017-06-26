/* @flow */

import * as React from 'react'
import * as actions from '../actions'
import { Field } from '../dialects/base'
import IndeterminateCheckbox from './IndeterminateCheckbox'


export default class ColumnSelector extends React.PureComponent {
  handleRowClick (field: Field) {
    if (this.props.onColumnClick) {
      this.props.onColumnClick(field)
    }
  }

  renderColumnRow (field: Field) {
    const { viewParams } = this.props
    const displayName = field.displayName
    const colTypeName = field.typeDisplayName
    const isShown = !!viewParams.displayFields.find(f => f.id === field.id)
    const isPivot = viewParams.vpivots.find(f => f.id === field.id)
    const isSort = (viewParams.sortKey.findIndex(entry => entry[0].id === field.id) !== -1)
    const refUpdater = this.props.stateRefUpdater
    return (
      <tr key={field.id}>
        <td className='col-colName' onClick={e => this.handleRowClick(field)}>
          {displayName}
        </td>
        <td className='col-colType'>{colTypeName}</td>
        <td className='col-check'>
          <input
            className='colSel-check'
            type='checkbox'
            title='Show this column'
            ref={'showCheckbox-' + field.id}
            onChange={() => actions.toggleShown(field, refUpdater)}
            checked={isShown} />
        </td>
        <td className='col-check'>
          <input
            className='colSel-check'
            type='checkbox'
            title='Pivot by column'
            ref={'pivotCheckbox-' + field.id}
            onChange={() => actions.togglePivot(field, refUpdater)}
            checked={isPivot} />
        </td>
        <td className='col-check'>
          <input
            className='colSel-check'
            type='checkbox'
            title='Sort by column'
            ref={'sortCheckbox-' + field.id}
            onChange={() => actions.toggleSort(field, refUpdater)}
            checked={isSort} />
        </td>
      </tr>
    )
  }

  // render row with checkboxes to select / deselect all items:
  renderAllRow () {
    const {schema, viewParams} = this.props
    const allShown = schema.fields.length === viewParams.displayFields.length
    const someShown = (viewParams.displayFields.length > 0)
    const refUpdater = this.props.stateRefUpdater
    return (
      <tr className='all-row' >
        <td className='col-colName-all'>All Columns</td>
        <td className='col-colType' />
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
    const fields = schema.fields.slice()
    fields.sort((d1, d2) => d1.displayName.localeCompare(d2.displayName))
    const allRow = this.renderAllRow()
    const columnRows = fields.map(this.renderColumnRow.bind(this))

    return (
      <div className='column-selector'>
        <div className='column-selector-header'>
          <table className='table table-condensed pt-interactive column-selector-table'>
            <thead>
              <tr>
                <th className='column-selector-th col-colName'>Column</th>
                <th className='column-selector-th col-colType' />
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
