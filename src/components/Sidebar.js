/* @flow */

import * as React from 'react'
import * as actions from '../actions'
import ColumnSelector from './ColumnSelector'

export default class Sidebar extends React.Component {
  render () {
    const appState = this.props.appState
    const refUpdater = this.props.stateRefUpdater
    return (
      <div className='full-height sidebar sidebar-collapsed'>
        <div className='sidebar-placeholder'>
          <div className='btn-lg'>
            <span className='glyphicon glyphicon-menu-hamburger' aria-hidden='true' />
          </div>
        </div>
        <div className='sidebar-content'>
          <div>
            <h5>General:</h5>
            <input
              type='checkbox'
              title='Show Root Row'
              onChange={() => actions.toggleShowRoot(refUpdater)}
              checked={appState.showRoot} />
            <label className='show-root-label'>Show Global Totals as First Row</label>
          </div>
          <br />
          <h5>Columns:</h5>
          <ColumnSelector appState={this.props.appState} stateRefUpdater={this.props.stateRefUpdater} />
        </div>
      </div>
    )
  }
}
