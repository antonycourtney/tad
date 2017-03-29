/* @flow */

import * as React from 'react'
import * as actions from '../actions'
import ColumnSelector from './ColumnSelector'
import ColumnList from './ColumnList'
import SingleColumnSelect from './SingleColumnSelect'
import { ColumnListType } from './constants'
import { Schema } from '../reltab'
import { Checkbox } from '@blueprintjs/core'

const sortKeyRowFormatter = (schema: Schema, row: [string, boolean]) => {
  const [cid, asc] = row
  const displayName = schema.displayName(cid)
  const ascStr = asc ? 'asc' : 'desc'
  return ([
    <td key={cid} className='col-colName'>{displayName}</td>,
    <td key={'sortDir-' + cid}>{ascStr}</td>
  ])
}

export default class Sidebar extends React.Component {
  state: any

  constructor (props: any) {
    super(props)
    this.state = {expanded: false}
  }

  onExpandClick () {
    this.setState({expanded: !this.state.expanded})
  }

  onLeafColumnSelect (event: Object) {
    const selStr = event.target.value
    const cid = (selStr === '__none') ? null : selStr
    console.log('onLeafColumnSelect: ', cid)
    const refUpdater = this.props.stateRefUpdater
    refUpdater(appState => appState.setIn(['viewState', 'viewParams',
      'pivotLeafColumn'], cid))
  }

  render () {
    const viewParams = this.props.viewParams
    const refUpdater = this.props.stateRefUpdater
    const expandClass = this.state.expanded ? 'sidebar-expanded' : 'sidebar-collapsed'
/*
<input
  type='checkbox'
  title='Show Root Row'
  onChange={() => actions.toggleShowRoot(refUpdater)}
  checked={viewParams.showRoot} />
  <label className='show-root-label'>Show Global Totals as First Row</label>
*/
    return (
      <div className={'sidebar ' + expandClass}>
        <div className='sidebar-placeholder'>
          <button type='button' className='pt-button pt-minimal pt-icon-cog'
            onClick={e => this.onExpandClick(e)} />
        </div>
        <div className='sidebar-content'>
          <div className='sidebar-content-inner'>
            <button type='button'
              className='pt-button pt-icon-chevron-left sidebar-collapse-button'
              onClick={e => this.onExpandClick(e)} />
            <div className='ui-block'>
              <h6>General</h6>
              <div className='root-check-group'>
                <Checkbox
                  className='pt-condensed'
                  checked={viewParams.showRoot}
                  onChange={() => actions.toggleShowRoot(refUpdater)}
                  label='Show Global Totals as First Row'
                />
              </div>
            </div>
            <div className='ui-block'>
              <h6>Columns</h6>
              <ColumnSelector
                schema={this.props.baseSchema}
                viewParams={viewParams}
                stateRefUpdater={this.props.stateRefUpdater} />
            </div>
            <div className='ui-block'>
              <h6>Pivots <small className='ui-subtext'>(drag to reorder)</small></h6>
              <ColumnList
                schema={this.props.baseSchema}
                columnListType={ColumnListType.PIVOT}
                items={viewParams.vpivots}
                stateRefUpdater={this.props.stateRefUpdater} />
              <SingleColumnSelect
                schema={this.props.baseSchema}
                stateRefUpdater={this.props.stateRefUpdater}
                label='Pivot Tree Leaf Level'
                value={viewParams.pivotLeafColumn}
                disabled={(this.props.viewParams.vpivots.length === 0)}
                onChange={e => this.onLeafColumnSelect(e)}
              />
            </div>
            <div className='ui-block'>
              <h6>Display Order <small className='ui-subtext'>(drag to reorder)</small></h6>
              <ColumnList
                schema={this.props.baseSchema}
                columnListType={ColumnListType.DISPLAY}
                items={viewParams.displayColumns}
                stateRefUpdater={this.props.stateRefUpdater} />
            </div>
            <div className='ui-block'>
              <h6>Sort Order <small className='ui-subtext'>(drag to reorder)</small></h6>
              <ColumnList
                schema={this.props.baseSchema}
                columnListType={ColumnListType.SORT}
                headerLabels={['Sort Dir']}
                items={viewParams.sortKey}
                rowFormatter={sortKeyRowFormatter}
                stateRefUpdater={this.props.stateRefUpdater} />
            </div>
          </div>
        </div>
      </div>
    )
  }
}
