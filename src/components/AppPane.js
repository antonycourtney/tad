/* @flow */

import * as React from 'react'
import Sidebar from './Sidebar'
import Grid from './Grid'
import PivotTreeModel from '../PivotTreeModel'

/**
 * top level application pane
 */
export default class AppPane extends React.Component {
  ptm: PivotTreeModel

  constructor (props: any) {
    super(props)
    const appState = this.props.appState

    // This should probably live in this.state...
    this.ptm = new PivotTreeModel(appState.rtc, appState.baseQuery, [])
    this.ptm.openPath([])
  }

  render () {
    return (
      <div className='container-fluid full-height main-container'>
        <Sidebar appState={this.props.appState} stateRefUpdater={this.props.stateRefUpdater} />
        <Grid ptm={this.ptm} />
      </div>
    )
  }
}
