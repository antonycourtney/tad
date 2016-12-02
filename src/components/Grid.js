/* @flow */

import * as React from 'react'
import * as epslick from '../epslick'
import PivotTreeModel from '../PivotTreeModel'
import * as _ from 'lodash'

/**
 * A wrapper around SlickGrid
 *
 */
export default class Grid extends React.Component {
  sgv: Object
  ptm: PivotTreeModel

  constructor (props: any) {
    super(props)
    const appState = this.props.appState

    // This should probably live in this.state...
    this.ptm = new PivotTreeModel(appState.rtc, appState.baseQuery, [])
    this.ptm.openPath([])
  }

  componentDidMount () {
    this.sgv = epslick.sgView('#epGrid', this.ptm)
  }

  componentWillReceiveProps (props: any) {
    const prevPivots = this.ptm.getPivots()
    const pivots = props.appState.vpivots

    console.log('Grid.componentWillReceiveProps: ', prevPivots, pivots)

    if (!(_.isEqual(prevPivots, pivots))) {
      console.log('new pivots, pivoting...')
      this.ptm.setPivots(pivots)
//      this.sgv.refreshFromModel()
    }
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
