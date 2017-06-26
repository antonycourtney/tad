/* @flow */

import * as React from 'react'
import {RadioGroup, Radio} from '@blueprintjs/core'
import * as actions from '../actions'
import { Field } from '../dialects/base'

const _ = require('lodash')

export default class FormatPanel extends React.Component {
  state: Object
  uniqFieldsByTypes: { [type: string]: Field }
  constructor (props: any) {
    super(props)
    const schema = props.schema
    this.uniqFieldsByTypes = _.keyBy(this.props.schema.fields, f => f.typeDisplayName)
    const firstField = schema.fields && schema.fields.length > 0 ? schema.fields[0] : null
    this.state = { formatKind: 'default', colType: Object.keys(this.uniqFieldsByTypes)[0], selectedField: firstField }
  }

  // radio group handler
  handleFormatKind (event: any) {
    this.setState({formatKind: event.target.value})
  }

  // column type select handler
  handleTypeSelect (event: any) {
    this.setState({colType: event.target.value})
  }

  handleColumnSelect (event: any) {
    this.setState({selectedField: this.props.schema.getField(event.target.value)})
  }

  // render a select for columns of type state.colType:
  renderColumnSelect () {
    const schema = this.props.schema
    const fields = schema.sortedFields()
    const colOpts = fields.map((field) =>
      <option key={'colSel-' + field.id} value={field.id}>{field.displayName}</option>
    )

    return (
      <select
        className='format-col-select'
        disabled={this.state.formatKind !== 'column'}
        value={this.state.selectedField.id}
        onChange={event => this.handleColumnSelect(event)} >
        {colOpts}
      </select>
    )
  }

  renderFormatPanel () {
    const viewParams = this.props.viewParams
    const updater = this.props.stateRefUpdater

    // return appropriate subpanel component type for given
    // column type:

    let colType
    let currentOpts
    let changeHandler

    // TODO: Really don't like fields by types to get their format options.
    // But OpsLab has arbitrary data types since it can create its own data types. Each field, then
    // needs to define their own format options and panels based on some information that exists only
    // on an Opslab PG-dialect Field.
    const subPanelComponentForType = (columnType: string) => {
      if (this.state.formatKind === 'default') {
        return this.uniqFieldsByTypes[columnType].getFormatPanel()
      }

      return this.state.selectedField.getFormatPanel()
    }
    
    if (this.state.formatKind === 'default') {
      colType = this.state.colType
      currentOpts = this.props.viewParams.getColumnFormat(this.uniqFieldsByTypes[colType])
      changeHandler = fopts => actions.setDefaultFormatOptions(colType, fopts, updater)
    } else {
      const targetField = this.state.selectedField
      colType = targetField.type
      currentOpts = viewParams.getColumnFormat(targetField)
      changeHandler = fopts => actions.setColumnFormatOptions(targetField, fopts, updater)
    }
    const PanelComponent = subPanelComponentForType(colType)
    const formatPanel =
      <PanelComponent
        value={currentOpts}
        onChange={changeHandler} />
    return formatPanel
  }

  render () {
    const columnSelect = this.renderColumnSelect()
    let formatPanel = this.renderFormatPanel()

    const colTypeSelect = (
      <select
        disabled={this.state.formatKind !== 'default'}
        value={this.state.colType}
        onChange={event => this.handleTypeSelect(event)} >
        {Object.keys(this.uniqFieldsByTypes).map((type) => (
          <option key={type}>{ type }</option>
        ))}
      </select>
    )

    return (
      <div className='ui-block'>
        <h6>Apply To</h6>
        <div className='pt-form-group'>
          <RadioGroup
            selectedValue={this.state.formatKind}
            onChange={event => this.handleFormatKind(event)}>
            <Radio label='Default for Columns of Type ' value='default'>
              {colTypeSelect}
            </Radio>
            <Radio label='Specific Column ' value='column'>
              {columnSelect}
            </Radio>
          </RadioGroup>
        </div>
        <h6>Format Properties</h6>
        {formatPanel}
      </div>
    )
  }
}
