/* @flow */

import * as React from 'react'
import * as actions from '../actions'
import ColumnSelector from './ColumnSelector'
import PivotOrderPanel from './PivotOrderPanel'
import DisplayOrderPanel from './DisplayOrderPanel'
import SortOrderPanel from './SortOrderPanel'
import { Checkbox, Tabs2, Tab2 } from '@blueprintjs/core'

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

    const pivotPanel =
      <PivotOrderPanel
        baseSchema={this.props.baseSchema}
        viewParams={viewParams}
        stateRefUpdater={this.props.stateRefUpdater} />
    const displayPanel =
      <DisplayOrderPanel
        baseSchema={this.props.baseSchema}
        viewParams={viewParams}
        stateRefUpdater={this.props.stateRefUpdater} />
    const sortPanel =
      <SortOrderPanel
        baseSchema={this.props.baseSchema}
        viewParams={viewParams}
        stateRefUpdater={this.props.stateRefUpdater} />

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
            <div className='ui-block addl-col-props'>
              <h6>Additional Column Properties</h6>
              <Tabs2 animate={false} id='ColumnPropTabs' >
                <Tab2 id='shownColumnsTab' title='Display Order' panel={displayPanel} />
                <Tab2 id='pivotColumnsTab' title='Pivot' panel={pivotPanel} />
                <Tab2 id='sortColumnsTab' title='Sort' panel={sortPanel} />
              </Tabs2>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
