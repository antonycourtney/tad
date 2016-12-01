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
        <Sidebar ptm={this.props.ptm} />
        <Grid ptm={this.props.ptm} />
      </div>
    )
  }
}
