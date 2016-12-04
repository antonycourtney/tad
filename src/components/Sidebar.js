/* @flow */

import * as React from 'react'
import * as actions from '../actions'
import ColumnSelector from './ColumnSelector'
import ColumnList from './ColumnList'
import SingleColumnSelect from './SingleColumnSelect'
import { ColumnListType } from './constants'

const sortKeyRowFormatter = (appState, row: [string, boolean]) => {
  const [cid, asc] = row
  const displayName = appState.baseSchema.displayName(cid)
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
    refUpdater(appState => appState.set('pivotLeafColumn', cid))
  }

  render () {
    const appState = this.props.appState
    const refUpdater = this.props.stateRefUpdater
    const expandClass = this.state.expanded ? 'sidebar-expanded' : 'sidebar-collapsed'
    return (
      <div className={'sidebar ' + expandClass}>
        <div className='sidebar-placeholder'>
          <button type='button'
            className='btn btn-xs btn-default'
            onClick={e => this.onExpandClick(e)} >
            <span className='glyphicon glyphicon-cog' aria-hidden='true' />
          </button>
        </div>
        <div className='sidebar-content'>
          <div className='sidebar-content-inner'>
            <button type='button'
              className='btn btn-xs btn-default'
              onClick={e => this.onExpandClick(e)} >
              <span className='glyphicon glyphicon-chevron-left' aria-hidden='true' />
            </button>
            <h5>General</h5>
            <input
              type='checkbox'
              title='Show Root Row'
              onChange={() => actions.toggleShowRoot(refUpdater)}
              checked={appState.showRoot} />
            <label className='show-root-label'>Show Global Totals as First Row</label>
            <h5>Columns</h5>
            <ColumnSelector appState={this.props.appState} stateRefUpdater={this.props.stateRefUpdater} />
            <br />
            <h5>Pivots <small>(drag to reorder)</small></h5>
            <ColumnList
              columnListType={ColumnListType.PIVOT}
              appState={this.props.appState}
              items={this.props.appState.vpivots}
              stateRefUpdater={this.props.stateRefUpdater} />
            <SingleColumnSelect
              appState={this.props.appState}
              stateRefUpdater={this.props.stateRefUpdater}
              label='Pivot Tree Leaf Level'
              value={appState.pivotLeafColumn}
              disabled={(this.props.appState.vpivots.length === 0)}
              onChange={e => this.onLeafColumnSelect(e)}
            />
            <br />
            <h5>Display Order <small>(drag to reorder)</small></h5>
            <ColumnList
              columnListType={ColumnListType.DISPLAY}
              appState={this.props.appState}
              items={this.props.appState.displayColumns}
              stateRefUpdater={this.props.stateRefUpdater} />
            <br />
            <h5>Sort Order <small>(drag to reorder)</small></h5>
            <ColumnList
              columnListType={ColumnListType.SORT}
              appState={this.props.appState}
              headerLabels={['Sort Dir']}
              items={this.props.appState.sortKey}
              rowFormatter={sortKeyRowFormatter}
              stateRefUpdater={this.props.stateRefUpdater} />
          </div>
        </div>
      </div>
    )
  }
}
