/* @flow */

import * as React from 'react'
import * as reltab from '../reltab'
import * as actions from '../actions'
import FilterEditor from './FilterEditor'

export default class Footer extends React.Component {
  state: { expanded: boolean, dirty: boolean, prevFilter: ?reltab.FilterExp }

  constructor (props: any) {
    super(props)
    this.state = { expanded: false, dirty: false, prevFilter: null }
  }

  setExpandedState (nextState: boolean) {
    if (nextState && !this.state.dirty) {
      // snap current filter into prevFilter:
      const prevFilter = this.props.appState.viewState.viewParams.filterExp
      this.setState({expanded: nextState, prevFilter, dirty: true})
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
    const fe = this.state.prevFilter || new reltab.FilterExp()
    actions.setFilter(fe, this.props.stateRefUpdater)
    this.setExpandedState(false)
    this.setState({dirty: false, prevFilter: null})
  }

  handleFilterApply (filterExp: reltab.FilterExp) {
    actions.setFilter(filterExp, this.props.stateRefUpdater)
  }

  handleFilterDone () {
    this.setExpandedState(false)
    this.setState({dirty: false, prevFilter: null})
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
