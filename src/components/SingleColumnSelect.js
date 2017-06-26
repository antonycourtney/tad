/* @flow */

import * as React from 'react'
import { Field } from '../dialects/base'

export default class SingleColumnSelect extends React.Component {

  renderColOption (f: Field) {
    const displayName = f.displayName
    return (
      <option key={f.id} value={f.id}>{displayName}</option>
    )
  }

  render () {
    const schema = this.props.schema

    const fields = schema.fields.slice()
    fields.sort((f1, f2) => f1.displayName.localeCompare(f2.displayName))
    const colOptions = fields.map(f => this.renderColOption(f))

    const noneOption = (<option key='__none' value='__none'>none</option>)
    colOptions.unshift(noneOption)

    const propVal = this.props.value
    const selVal = (propVal === null) ? '__none' : propVal

    return (
      <div className='pivot-leaf-select'>
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
