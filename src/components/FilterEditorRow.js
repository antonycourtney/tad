/* @flow */

import * as React from 'react'
import * as reltab from '../reltab'
import type {Scalar} from '../reltab' // eslint-disable-line
import {Button, NumericInput} from '@blueprintjs/core'

type EditorRowState = {
  columnId: ?string,
  op: ?string,
  value: Scalar
}

export default class FilterEditorRow extends React.Component {
  state: EditorRowState

  constructor (props: any) {
    super(props)
    const {relExp} = props
    let rs = { columnId: null, op: null, value: null }
    if (relExp) {
      const columnId = relExp.lhsCol()
      const op = relExp.op
      const value = (relExp.expType === 'BinRelExp') ? relExp.rhs.val : null
      rs = { columnId, op, value }
    }
    this.state = rs
  }

  handleColumnSelect (event: any) {
    const sval = event.target.value
    const cid = (sval === '') ? null : sval
    this.setState({columnId: cid})
  }

  handleOpSelect (event: any) {
    const sval = event.target.value
    const op = (sval === '') ? null : sval
    this.setState({ op })
  }

  handleValueChange (val: any) {
    this.setState({ value: val })
  }

  handleDeleteRow () {
    if (this.props.onDeleteRow) {
      this.props.onDeleteRow()
    }
  }

  renderColumnSelect () {
    const { schema } = this.props
    const { columnId } = this.state
    const columnChoices = schema.sortedColumns()
    const colOpts = columnChoices.map(cid => (
      <option
        key={'filterRowColSel-' + cid} value={cid}>{schema.displayName(cid)}</option>))
    const selectVal = (columnId == null) ? '' : columnId
    return (
      <div className='pt-select filter-row-col-select'>
        <select
          value={selectVal}
          onChange={event => this.handleColumnSelect(event)} >
          <option value=''>Column...</option>
          {colOpts}
        </select>
      </div>
    )
  }

  renderOpSelect () {
    const { schema } = this.props
    const { columnId, op } = this.state
    let opChoices = []
    let disabled=false
    if (columnId != null) {
      const colType = schema.columnType(columnId)
      const ops = reltab.columnTypeOps(colType)
      opChoices = ops.map((opc, idx) => (
        <option
          key={'relop-' + idx}
          value={opc}>{reltab.opDisplayName(opc)}</option>))
    } else {
      disabled = true
    }
    const opVal = (op === null) ? '' : op
    return (
      <div className='pt-select filter-row-col-select'>
        <select
          value={opVal}
          disabled={disabled}
          onChange={event => this.handleOpSelect(event)} >
          <option value=''>Operator...</option>
          {opChoices}
        </select>
      </div>
    )
  }

  renderValInput () {
    const { schema } = this.props
    const { columnId, op, value } = this.state
    let disabled = (columnId == null) || (op == null)
    let inputComponent = null
    if (columnId != null) {
      const columnType = schema.columnType(columnId)
      if (reltab.typeIsNumeric(columnType)) {
        inputComponent = (
          <NumericInput
            onValueChange={v => this.handlValueChange(v)}
            placeholder='Value'
            disabled={disabled}
            value={value}
          />)
      }
    }
    if (inputComponent == null) {
      const compVal = value ? value : ''  // eslint-disable-line
      inputComponent = (
        <input
          className='pt-input'
          type='text'
          placeholder='Value'
          disabled={disabled}
          value={compVal}
          onChange={e => this.handleValueChange(e.target.value)}
          dir='auto'
        />)
    }
    return inputComponent
  }

  render () {
    const colSelect = this.renderColumnSelect()
    const opSelect = this.renderOpSelect()
    const valInput = this.renderValInput()
    return (
      <div className='filter-editor-row'>
        {colSelect}
        {opSelect}
        {valInput}
        <Button
          className='pt-minimal'
          iconName='delete'
          onClick={e => this.handleDeleteRow()}
        />
      </div>
    )
  }
}
