/* @flow */

import * as React from 'react'
import * as actions from '../actions'
import ColumnSelector from './ColumnSelector'
import PivotOrderPanel from './PivotOrderPanel'
import DisplayOrderPanel from './DisplayOrderPanel'
import SortOrderPanel from './SortOrderPanel'
import { Checkbox } from '@blueprintjs/core'

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
    const viewParams = this.props.viewParams
    const refUpdater = this.props.stateRefUpdater
    const expandClass = this.state.expanded ? 'sidebar-expanded' : 'sidebar-collapsed'
    return (
      <div className={'sidebar ' + expandClass}>
        <div className='sidebar-placeholder'>
          <button type='button' className='pt-button pt-minimal pt-icon-cog'
            onClick={e => this.onExpandClick(e)} />
        </div>
        <div className='sidebar-content'>
          <div className='sidebar-content-inner'>
            <button type='button'
              className='pt-button pt-icon-chevron-left sidebar-collapse-button'
              onClick={e => this.onExpandClick(e)} />
            <div className='ui-block'>
              <h6>General</h6>
              <div className='root-check-group'>
                <Checkbox
                  className='pt-condensed'
                  checked={viewParams.showRoot}
                  onChange={() => actions.toggleShowRoot(refUpdater)}
                  label='Show Global Totals as First Row'
                />
              </div>
            </div>
            <div className='ui-block'>
              <h6>Columns</h6>
              <ColumnSelector
                schema={this.props.baseSchema}
                viewParams={viewParams}
                stateRefUpdater={this.props.stateRefUpdater} />
            </div>
            <PivotOrderPanel
              baseSchema={this.props.baseSchema}
              viewParams={viewParams}
              stateRefUpdater={this.props.stateRefUpdater} />
            <DisplayOrderPanel
              baseSchema={this.props.baseSchema}
              viewParams={viewParams}
              stateRefUpdater={this.props.stateRefUpdater} />
            <SortOrderPanel
              baseSchema={this.props.baseSchema}
              viewParams={viewParams}
              stateRefUpdater={this.props.stateRefUpdater} />
          </div>
        </div>
      </div>
    )
  }
}
