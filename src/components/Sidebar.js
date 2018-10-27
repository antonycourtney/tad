/* @flow */

import * as React from 'react'
import * as actions from '../actions'
import ColumnSelector from './ColumnSelector'
import SingleColumnSelect from './SingleColumnSelect'
import PivotOrderPanel from './PivotOrderPanel'
import DisplayOrderPanel from './DisplayOrderPanel'
import SortOrderPanel from './SortOrderPanel'
import AggPanel from './AggPanel'
import FormatPanel from './FormatPanel'
import { Checkbox, Tabs, Tab } from '@blueprintjs/core'

export default class Sidebar extends React.Component {
  state: any

  constructor (props: any) {
    super(props)
    this.state = {expanded: false}
  }

  onExpandClick () {
    this.setState({expanded: !this.state.expanded})
  }

  onLeafColumnSelect (event: Object) {
    const selStr = event.target.value
    const cid = (selStr === '__none') ? null : selStr
    console.log('onLeafColumnSelect: ', cid)
    const refUpdater = this.props.stateRefUpdater
    refUpdater(appState => appState.setIn(['viewState', 'viewParams',
      'pivotLeafColumn'], cid))
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

    const aggPanel =
      <AggPanel
        schema={this.props.baseSchema}
        viewParams={viewParams}
        stateRefUpdater={this.props.stateRefUpdater} />

    const formatPanel =
      <FormatPanel
        schema={this.props.baseSchema}
        viewParams={viewParams}
        stateRefUpdater={this.props.stateRefUpdater} />

    return (
      <div className={'sidebar ' + expandClass}>
        <div className='sidebar-placeholder'>
          <button type='button' className='bp3-button bp3-minimal bp3-icon-cog'
            onClick={e => this.onExpandClick(e)} />
        </div>
        <div className='sidebar-content'>
          <div className='sidebar-content-inner'>
            <button type='button'
              className='bp3-button bp3-icon-chevron-left sidebar-collapse-button'
              onClick={e => this.onExpandClick(e)} />
            <div className='ui-block'>
              <h5 className='bp3-heading'>General</h5>
              <div className='root-check-group'>
                <Checkbox
                  className='bp3-condensed'
                  checked={viewParams.showRoot}
                  onChange={() => actions.toggleShowRoot(refUpdater)}
                  label='Show Global Aggregations as Top Row'
                />
              </div>
            </div>
            <div className='ui-block'>
              <h5 className='bp3-heading'>Columns</h5>
              <ColumnSelector
                onColumnClick={this.props.onColumnClick}
                schema={this.props.baseSchema}
                viewParams={viewParams}
                stateRefUpdater={this.props.stateRefUpdater} />
              <SingleColumnSelect
                schema={this.props.baseSchema}
                stateRefUpdater
                label='Pivot Tree Leaf Level'
                value={viewParams.pivotLeafColumn}
                disabled={(this.props.viewParams.vpivots.length === 0)}
                onChange={e => this.onLeafColumnSelect(e)}
              />
            </div>
            <div className='ui-block addl-col-props'>
              <h5 className='bp3-heading'>Additional Properties</h5>
              <Tabs animate={false} id='ColumnPropTabs' >
                <Tab id='shownColumnsTab' title='Order' panel={displayPanel} />
                <Tab id='pivotColumnsTab' title='Pivot' panel={pivotPanel} />
                <Tab id='sortColumnsTab' title='Sort' panel={sortPanel} />
                <Tab id='aggColumnsTab' title='Aggregations' panel={aggPanel} />
                <Tab id='formatColumnsTab' title='Format' panel={formatPanel} />
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
