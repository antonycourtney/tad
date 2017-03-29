/* @flow */

import * as React from 'react'
import ColumnList from './ColumnList'
import SingleColumnSelect from './SingleColumnSelect'
import { ColumnListType } from './constants'

export default class PivotOrderPanel extends React.Component {
  onLeafColumnSelect (event: Object) {
    const selStr = event.target.value
    const cid = (selStr === '__none') ? null : selStr
    console.log('onLeafColumnSelect: ', cid)
    const refUpdater = this.props.stateRefUpdater
    refUpdater(appState => appState.setIn(['viewState', 'viewParams',
      'pivotLeafColumn'], cid))
  }

  render () {
    const {viewParams, stateRefUpdater} = this.props

    return (
      <div className='ui-block'>
        <h6>Pivots <small className='ui-subtext'>(drag to reorder)</small></h6>
        <ColumnList
          schema={this.props.baseSchema}
          columnListType={ColumnListType.PIVOT}
          items={viewParams.vpivots}
          stateRefUpdater={stateRefUpdater} />
        <SingleColumnSelect
          schema={this.props.baseSchema}
          stateRefUpdater
          label='Pivot Tree Leaf Level'
          value={viewParams.pivotLeafColumn}
          disabled={(this.props.viewParams.vpivots.length === 0)}
          onChange={e => this.onLeafColumnSelect(e)}
        />
      </div>
    )
  }
}
