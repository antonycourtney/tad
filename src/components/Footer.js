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

  handleFilterButtonClicked (event: any) {
    event.preventDefault()
    const nextState = !this.state.expanded
    this.setState({expanded: nextState})
    if (this.props.onFilterToggled) {
      this.props.onFilterToggled(nextState)
    }
  }

  handleFilterCancel (event: any) {
    this.setState({ expanded: false })
  }

  handleFilterApply (filterExp: reltab.FilterExp) {
    actions.setFilter(filterExp, this.props.stateRefUpdater)
  }

  handleFilterDone () {
    this.setState({ expanded: false })
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

    return (
      <div className={'footer ' + expandClass}>
        <div className='footer-top-row'>
          <a
            onClick={(event) => this.handleFilterButtonClicked(event)}
            tabIndex='0'>Filter</a>
          <span className='filter-summary'> {filterStr}</span>
        </div>
        {editorComponent}
      </div>
    )
  }
}
