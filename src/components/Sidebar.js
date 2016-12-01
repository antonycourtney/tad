/* @flow */

import * as React from 'react'
import ColumnSelector from './ColumnSelector'

export default class Sidebar extends React.Component {
  render () {
    return (
      <div className='full-height sidebar sidebar-collapsed'>
        <div className='sidebar-placeholder'>
          <div className='btn-lg'>
            <span className='glyphicon glyphicon-menu-hamburger' aria-hidden='true' />
          </div>
        </div>
        <div className='sidebar-content'>
          <h5>Columns:</h5>
          <ColumnSelector appState={this.props.appState} stateRefUpdater={this.props.stateRefUpdater} />
        </div>
      </div>
    )
  }
}
