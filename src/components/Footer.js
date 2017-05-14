/* @flow */

import * as React from 'react'
import * as reltab from '../reltab'
import * as actions from '../actions'
import FilterEditor from './FilterEditor'

export default class Footer extends React.Component {
  state: { expanded: boolean }

  constructor (props: any) {
    super(props)
    this.state = { expanded: false }
  }

  setExpandedState (nextState: boolean) {
    this.setState({expanded: nextState})
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
    this.setExpandedState(false)
  }

  handleFilterApply (filterExp: reltab.FilterExp) {
    actions.setFilter(filterExp, this.props.stateRefUpdater)
  }

  handleFilterDone () {
    this.setExpandedState(false)
  }

  render () {
    const {appState} = this.props
    const filterExp = appState.viewState.viewParams.filterExp
    const filterStr = filterExp.toSqlWhere()

    const expandClass = this.state.expanded ? 'footer-expanded' : 'footer-collapsed'

    const editorComponent = this.state.expanded ? (
      <FilterEditor
        schema={appState.baseSchema}
        filterExp={filterExp}
        onCancel={e => this.handleFilterCancel(e)}
        onApply={fexp => this.handleFilterApply(fexp)}
        onDone={() => this.handleFilterDone()} />
      ) : null

    let rowCountBlock = null
    const queryView = appState.viewState.queryView
    if (queryView) {
      const rowCountStr = queryView.rowCount.toLocaleString(undefined, {grouping: true})
      rowCountBlock = (
        <div className='footer-block'>
          <span className='footer-label'>Rows: </span>
          <span className='footer-value'>{rowCountStr}</span>
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
