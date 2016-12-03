/* @flow */

import * as React from 'react'
import ColumnRow from './ColumnRow'
/*
 * A simple ordered list of columns.  Supports re-ordering
 */
export default class ColumnList extends React.Component {
  renderColumnRow (cid: string) {
    return (
      <ColumnRow
        key={cid}
        columnListType={this.props.columnListType}
        appState={this.props.appState}
        stateRefUpdater={this.props.stateRefUpdater}
        columnId={cid} />
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
