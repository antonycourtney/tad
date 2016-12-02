/* @flow */

import * as React from 'react'
import Sidebar from './Sidebar'
import Grid from './Grid'
/**
 * top level application pane
 */
export default class AppPane extends React.Component {
  render () {
    return (
      <div className='container-fluid full-height main-container'>
        <Sidebar appState={this.props.appState} stateRefUpdater={this.props.stateRefUpdater} />
        <Grid appState={this.props.appState} stateRefUpdater={this.props.stateRefUpdater} />
      </div>
    )
  }
}
