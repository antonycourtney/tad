/* @flow */

import * as React from 'react'
import * as reltab from '../reltab'
import {Button} from '@blueprintjs/core'
import FilterEditorRow from './FilterEditorRow'

export default class FilterEditor extends React.Component {
  state: {op: reltab.BoolOp, opArgs: Array<?reltab.RelExp>}

  constructor (props: any) {
    super(props)
    const { filterExp } = props
    let op, opArgs
    if (filterExp != null) {
      ({ op, opArgs } = filterExp)
    } else {
      op = 'AND'
      opArgs = [null]
    }
    this.state = {op, opArgs}
  }

  renderFilterRows () {
    const {opArgs} = this.state
    return opArgs.map((fe, idx) => {
      return (<FilterEditorRow
        key={'fe-row-' + idx}
        schema={this.props.schema}
        filterExp={fe}
        onDeleteRow={() => this.handleDeleteRow(idx)}
      />)
    })
  }

  handleAddRow () {
    const {opArgs} = this.state
    this.setState({ opArgs: opArgs.concat(null) })
  }

  handleDeleteRow (idx: number) {
    const {opArgs: prevArgs} = this.state
    const opArgs = prevArgs.slice().splice(idx)
    this.setState({ opArgs })
  }

  render () {
    const feRows = this.renderFilterRows()

    return (
      <div className='filter-editor'>
        <div className='filter-editor-select-row'>
          <div className='pt-select pt-minimal'>
            <select>
              <option value='AND'>All Of (AND)</option>
              <option value='OR'>Any Of (OR)</option>
            </select>
          </div>
        </div>
        <div className='filter-editor-edit-section'>
          {feRows}
          <div className='filter-edit-add-row'>
            <Button
              className='pt-minimal'
              iconName='add'
              onClick={e => this.handleAddRow()}
            />
          </div>
        </div>
        <div className='filter-editor-footer'>
          <Button
            text='Cancel'
            onClick={e => this.props.onCancel(e)} />
          <Button
            text='Apply'
            onClick={e => this.props.onApply(this.state.filterExp)} />
          <Button
            className='pt-intent-primary'
            onClick={e => this.props.onDone(this.state.filterExp)}
            text='Done' />
        </div>
      </div>
    )
  }
}
