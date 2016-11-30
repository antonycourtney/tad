/* @flow */

import * as React from 'react'
import Grid from './Grid'

/**
 * top level application pane
 */
export default class AppPane extends React.Component {
  render () {
    return (
      <div className='container-fluid full-height'>
        <div className='row full-height'>
            <div className='col-xs-12 full-height no-pad'>
              <Grid ptm={this.props.ptm} />
            </div>
        </div>
      </div>
    )
  }
}
