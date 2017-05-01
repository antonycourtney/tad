/* @flow */

import * as React from 'react'
import * as reltab from '../reltab'
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
  }

  handleFilterDone (filterExp: reltab.FilterExp) {
    this.setState({ expanded: false })
  }

  render () {
    const {appState} = this.props

    const expandClass = this.state.expanded ? 'footer-expanded' : 'footer-collapsed'

    const editorComponent = this.state.expanded ? (
      <FilterEditor
        schema={appState.baseSchema}
        initialFilterExp={appState.filterExp}
        onCancel={e => this.handleFilterCancel(e)}
        onApply={fexp => this.handleFilterApply(fexp)}
        onDone={fexp => this.handleFilterDone(fexp)} />
      ) : null

    return(
      <div className={'footer ' + expandClass}>
        <div className='footer-top-row'>
          <a
            onClick={(event) => this.handleFilterButtonClicked(event)}
            tabIndex='0'>Filter:</a>
          <span className='filter-summary'> x is not null</span>
        </div>
        {editorComponent}
      </div>
    )
  }
}
