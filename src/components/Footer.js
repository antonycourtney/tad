/* @flow */

import * as React from 'react'
import * as baseDialect from '../dialects/base'
import * as actions from '../actions'
import FilterEditor from './FilterEditor'

export default class Footer extends React.Component {
  state: { expanded: boolean, dirty: boolean, prevCondition: ?baseDialect.Condition }

  constructor (props: any) {
    super(props)
    this.state = { expanded: false, dirty: false, prevCondition: null }
  }

  setExpandedState (nextState: boolean) {
    if (nextState && !this.state.dirty) {
      // snap current filter into prevCondition:
      const prevCondition = this.props.appState.viewState.viewParams.condition
      this.setState({expanded: nextState, prevCondition, dirty: true})
    } else {
      this.setState({expanded: nextState})
    }
    if (this.props.onFilterToggled) {
      this.props.onFilterToggled(nextState)
    }
  }

  handleFilterButtonClicked (event: any) {
    event.preventDefault()
    const nextState = !this.state.expanded
    this.setExpandedState(nextState)
  }

  handleFilterCancel (event: any) {
    // restore previous filter:
    const cond = this.state.prevCondition || new this.props.appState.dialect.Condition()
    actions.setCondition(cond, this.props.stateRefUpdater)
    this.setExpandedState(false)
    this.setState({dirty: false, prevCondition: null})
  }

  handleFilterApply (condition: baseDialect.Condition) {
    actions.setCondition(condition, this.props.stateRefUpdater)
  }

  handleFilterDone () {
    this.setExpandedState(false)
    this.setState({dirty: false, prevCondition: null})
  }

  render () {
    const {appState} = this.props
    const condition = appState.viewState.viewParams.condition
    const filterStr = condition.toSqlWhere()

    const expandClass = this.state.expanded ? 'footer-expanded' : 'footer-collapsed'

    const editorComponent = this.state.expanded ? (
      <FilterEditor
        appState={appState}
        stateRefUpdater={this.props.stateRefUpdater}
        schema={appState.baseSchema}
        condition={condition}
        dialect={appState.dialect}
        onCancel={e => this.handleFilterCancel(e)}
        onApply={cond => this.handleFilterApply(cond)}
        onDone={() => this.handleFilterDone()} />
      ) : null

    let rowCountBlock = null
    const queryView = appState.viewState.queryView
    if (queryView) {
      const numFmt = num => num.toLocaleString(undefined, {grouping: true})

      const {rowCount, baseRowCount, filterRowCount} = queryView
      const rowCountStr = numFmt(rowCount)
      const rcParts = [rowCountStr]
      if (rowCount !== baseRowCount) {
        rcParts.push(' (')
        if ((filterRowCount !== baseRowCount) &&
            (filterRowCount !== rowCount)) {
          const filterCountStr = numFmt(filterRowCount)
          rcParts.push(filterCountStr)
          rcParts.push(' Filtered, ')
        }
        rcParts.push(numFmt(baseRowCount))
        rcParts.push(' Total)')
      }
      const rcStr = rcParts.join('')
      rowCountBlock = (
        <div className='footer-block'>
          <span className='footer-label'>Rows: </span>
          <span className='footer-value'>{rcStr}</span>
        </div>
      )
    }
    return (
      <div className={'footer ' + expandClass}>
        <div className='footer-top-row'>
          <div className='footer-filter-block'>
            <a
              onClick={(event) => this.handleFilterButtonClicked(event)}
              tabIndex='0'>Filter</a>
            <span className='filter-summary'> {filterStr}</span>
          </div>
          {rowCountBlock}
        </div>
        {editorComponent}
      </div>
    )
  }
}
