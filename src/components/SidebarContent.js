import React from 'react'
import * as actions from '../actions'
import ColumnSelector from './ColumnSelector'
import SingleColumnSelect from './SingleColumnSelect'
import PivotOrderPanel from './PivotOrderPanel'
import DisplayOrderPanel from './DisplayOrderPanel'
import SortOrderPanel from './SortOrderPanel'
import AggPanel from './AggPanel'
import FormatPanel from './FormatPanel'
import { Checkbox, Tabs2, Tab2 } from '@blueprintjs/core'

class SidebarContent extends React.Component {
  onLeafColumnSelect (event: Object) {
    const selStr = event.target.value
    const cid = (selStr === '__none') ? null : selStr
    console.log('onLeafColumnSelect: ', cid)
    const refUpdater = this.props.stateRefUpdater
    refUpdater(appState => appState.setIn(['viewState', 'viewParams',
      'pivotLeafFieldId'], cid))
  }
  
  render () {
    const viewParams = this.props.viewParams
    const dialect = this.props.dialect
    const refUpdater = this.props.stateRefUpdater

    const baseInfo = {
      schema: this.props.baseSchema,
      viewParams,
      stateRefUpdater: this.props.stateRefUpdater,
      dialect
    }

    const pivotPanel = <PivotOrderPanel {...baseInfo} />
    const displayPanel = <DisplayOrderPanel {...baseInfo} />
    const sortPanel = <SortOrderPanel {...baseInfo} />
    const aggPanel = <AggPanel {...baseInfo} />
    const formatPanel = <FormatPanel {...baseInfo} />

    return (
          <div>
            <div className='ui-block'>
              <h6>General</h6>
              <div className='root-check-group'>
                <Checkbox
                  className='pt-condensed'
                  checked={viewParams.showRoot}
                  onChange={() => actions.toggleShowRoot(refUpdater)}
                  label='Show Global Aggregations as Top Row'
                />
              </div>
            </div>
            <div className='ui-block'>
              <h6>Columns</h6>
              <ColumnSelector
                onColumnClick={this.props.onColumnClick}
                schema={this.props.baseSchema}
                viewParams={viewParams}
                stateRefUpdater={this.props.stateRefUpdater}
              />
              <SingleColumnSelect
                schema={this.props.baseSchema}
                stateRefUpdater
                label='Pivot Tree Leaf Level'
                value={viewParams.pivotLeafFieldId}
                disabled={(this.props.viewParams.vpivots.length === 0)}
                onChange={e => this.onLeafColumnSelect(e)}
              />
            </div>
            <div className='ui-block addl-col-props'>
              <h6>Additional Properties</h6>
              <Tabs2 animate={false} id='ColumnPropTabs'>
                <Tab2 id='shownColumnsTab' title='Order' panel={displayPanel}/>
                <Tab2 id='pivotColumnsTab' title='Pivot' panel={pivotPanel}/>
                <Tab2 id='sortColumnsTab' title='Sort' panel={sortPanel}/>
                <Tab2 id='aggColumnsTab' title='Aggregations' panel={aggPanel}/>
                <Tab2 id='formatColumnsTab' title='Format' panel={formatPanel}/>
              </Tabs2>
            </div>
          </div>

    )
  }
}

export default SidebarContent
