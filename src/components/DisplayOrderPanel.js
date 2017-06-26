/* @flow */

import * as React from 'react'
import ColumnList from './ColumnList'
import { ColumnListType } from './constants'

export default class DisplayOrderPanel extends React.Component {
  render () {
    const {viewParams, stateRefUpdater} = this.props

    return (
      <div className='ui-block'>
        <h6>Displayed Columns <small className='ui-subtext'>(drag to reorder)</small></h6>
        <ColumnList
          schema={this.props.schema}
          columnListType={ColumnListType.DISPLAY}
          items={viewParams.displayFields.map(f => ({ key: f.id, value: f.selectableName }))}
          stateRefUpdater={stateRefUpdater} />
      </div>
    )
  }
}
