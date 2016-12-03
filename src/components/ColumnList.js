/* @flow */

import * as React from 'react'

/*
 * A simple ordered list of columns.  Supports re-ordering
 */
export default class ColumnList extends React.Component {
  renderColumnRow (cid: string) {
    const appState = this.props.appState
    const schema = appState.baseSchema
    const displayName = schema.displayName(cid)
    // const refUpdater = this.props.stateRefUpdater
    return (
      <tr key={cid}>
        <td className='col-colName'>{displayName}</td>
      </tr>
    )
  }

  render () {
    const columnRows = this.props.columns.map(cid => this.renderColumnRow(cid))

    return (
      <div className='column-list'>
        <div className='column-list-header'>
          <table className='table table-condensed table-hover column-selector-table'>
            <thead>
              <tr>
                <th className='column-list-th col-colName'>Column</th>
              </tr>
            </thead>
          </table>
        </div>
        <div className='column-list-body'>
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
