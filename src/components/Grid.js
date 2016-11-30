/* @flow */

import * as React from 'react'
import * as epslick from '../epslick'

/**
 * A wrapper around SlickGrid
 *
 */
export default class Grid extends React.Component {
  sgv: Object

  componentDidMount () {
    this.sgv = epslick.sgView('#epGrid', this.props.ptm)
  }

  shouldComponentUpdate () {
    return false // slickgrid will handle it
  }

  render () {
    return (
      <div id='epGrid' className='slickgrid-container full-height' />
    )
  }
 }
