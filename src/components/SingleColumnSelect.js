/* @flow */

import * as React from 'react'

export default class SingleColumnSelect extends React.Component {

  renderColOption (cid: string) {
    const appState = this.props.appState
    const schema = appState.baseSchema
    const displayName = schema.displayName(cid)
    return (
      <option key={cid} value={cid}>{displayName}</option>
    )
  }

  render () {
    const appState = this.props.appState
    const schema = appState.baseSchema

    const columnIds = schema.columns.slice()
    columnIds.sort((cid1, cid2) => schema.displayName(cid1).localeCompare(schema.displayName(cid2)))
    const colOptions = columnIds.map(cid => this.renderColOption(cid))

    const noneOption = (<option key='__none' value='__none'>none</option>)
    colOptions.unshift(noneOption)

    const propVal = this.props.value
    const selVal = (propVal === null) ? '__none' : propVal

    return (
      <div>
        <label>Pivot Tree Leaf Level:</label>
        <select className='scs-select'
          disabled={this.props.disabled}
          value={selVal}
          onChange={this.props.onChange} >
          {colOptions}
        </select>
      </div>
    )
  }
}
