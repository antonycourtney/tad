/* @flow */

import * as React from 'react'
import * as actions from '../actions'
import ColumnSelector from './ColumnSelector'
import ColumnList from './ColumnList'

export default class Sidebar extends React.Component {
  state: any

  constructor (props: any) {
    super(props)
    this.state = {expanded: false}
  }

  onExpandClick () {
    this.setState({expanded: !this.state.expanded})
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
            <h5>General:</h5>
            <input
              type='checkbox'
              title='Show Root Row'
              onChange={() => actions.toggleShowRoot(refUpdater)}
              checked={appState.showRoot} />
            <label className='show-root-label'>Show Global Totals as First Row</label>
            <h5>Columns:</h5>
            <ColumnSelector appState={this.props.appState} stateRefUpdater={this.props.stateRefUpdater} />
            <h5>Pivots:</h5>
            <ColumnList appState={this.props.appState}
              columns={this.props.appState.vpivots}
              stateRefUpdater={this.props.stateRefUpdater} />
            <h5>Display Order:</h5>
            <ColumnList appState={this.props.appState}
              columns={this.props.appState.displayColumns}
              stateRefUpdater={this.props.stateRefUpdater} />
            <h5>Sort Order:</h5>
            <ColumnList appState={this.props.appState}
              columns={this.props.appState.sortKey}
              stateRefUpdater={this.props.stateRefUpdater} />
          </div>
        </div>
      </div>
    )
  }
}
