/* @flow */

import * as React from 'react'
import ColumnList from './ColumnList'
import { ColumnListType } from './constants'

export default class PivotOrderPanel extends React.Component {
  render () {
    const {viewParams, stateRefUpdater} = this.props

    return (
      <div className='ui-block'>
        <h6>Pivot Columns <small className='ui-subtext'>(drag to reorder)</small></h6>
        <ColumnList
          schema={this.props.baseSchema}
          columnListType={ColumnListType.PIVOT}
          items={viewParams.vpivots}
          stateRefUpdater={stateRefUpdater} />
      </div>
    )
  }
}
