/* @flow */

import * as React from 'react'
import TextFormatPanel from './TextFormatPanel'
import NumFormatPanel from './NumFormatPanel'
import {RadioGroup, Radio} from '@blueprintjs/core'
import * as actions from '../actions'

export default class FormatPanel extends React.Component {
  state: Object
  constructor (props: any) {
    super(props)
    const schema = props.schema
    const firstCol = (schema.columns && schema.columns.length > 0) ? schema.columns[0] : null
    this.state = { formatKind: 'default', colType: 'text', selectedColumn: firstCol }
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
    this.setState({selectedColumn: event.target.value})
  }

  // render a select for columns of type state.colType:
  renderColumnSelect () {
    const schema = this.props.schema
    const typeCols = schema.columns
    const colOpts = typeCols.map(cid => (
      <option key={'colSel-' + cid} value={cid}>{schema.displayName(cid)}</option>))
    return (
      <select
        className='format-col-select'
        disabled={this.state.formatKind !== 'column'}
        value={this.state.selectedColumn}
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
    const subPanelComponentForType = (columnType: string) =>
      (columnType === 'text') ? TextFormatPanel : NumFormatPanel

    let colType
    let currentOpts
    let changeHandler
    if (this.state.formatKind === 'default') {
      colType = this.state.colType
      currentOpts = viewParams.defaultFormats[colType]
      changeHandler = fopts => actions.setDefaultFormatOptions(colType, fopts, updater)
    } else {
      const targetColumn = this.state.selectedColumn
      colType = this.props.schema.columnType(targetColumn)
      currentOpts = viewParams.getColumnFormat(this.props.schema, targetColumn)
      changeHandler = fopts => actions.setColumnFormatOptions(targetColumn, fopts, updater)
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
        <option value='text'>text</option>
        <option value='integer'>integer</option>
        <option value='real'>real</option>
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
