/* @flow */

import * as React from 'react'
import * as baseDialect from '../dialects/base'
import AppState from '../AppState'
import {Button} from '@blueprintjs/core'
import FilterEditorRow from './FilterEditorRow'

type RefUpdater = (f: ((s: AppState) => AppState)) => void

export default class FilterEditor extends React.Component {
  props: {
    appState: AppState,
    stateRefUpdater: RefUpdater,
    schema: baseDialect.Schema,
    dialect: baseDialect.Dialect,
    condition: ?baseDialect.Condition,
    onCancel: (e: any) => void,
    onApply: (fe: baseDialect.Condition) => void,
    onDone: () => void
  }
  state: {op: string, filters: Array<?baseDialect.Filter>, dirty: boolean}

  constructor (props: any) {
    super(props)
    const { condition = props.dialect.Condition() } = props
    const { op, filters } = condition

    this.state = {op, filters: filters.toArray().concat(null), dirty: false}
  }

  renderFilterRows () {
    const {filters = [null]} = this.state
    return filters.map((filter, idx) => {
      return (<FilterEditorRow
        appState={this.props.appState}
        stateRefUpdater={this.props.stateRefUpdater}
        key={'fe-row-' + idx}
        schema={this.props.schema}
        dialect={this.props.dialect}
        filter={filter}
        onDeleteRow={() => this.handleDeleteRow(idx)}
        onUpdate={(f) => this.handleUpdateRow(idx, f)}
      />)
    })
  }

  handleAddRow () {
    const {filters} = this.state
    this.setState({ filters: filters.concat(null), dirty: true })
  }

  handleDeleteRow (idx: number) {
    const {filters: prevFilters} = this.state
    const filters = prevFilters.slice()
    delete filters[idx]  // delete, not splice, to keep React keys correct
    this.setState({ filters, dirty: true })
  }

  handleOpChange (op: string) {
    this.setState({ op, dirty: true })
  }

  handleUpdateRow (idx: number, filter: ?baseDialect.Filter) {
    const {filters: prevFilters} = this.state
    const filters = (prevFilters.slice())
    filters[idx] = filter
    this.setState({ filters, dirty: true })
  }

  handleApply () {
    const {op, filters} = this.state
    const nnFilters: Array<baseDialect.Filter> = filters.filter(Boolean)
    const cond = new this.props.dialect.Condition(op, nnFilters)
    this.props.onApply(cond)
    this.setState({ dirty: false })
  }

  handleDone () {
    this.handleApply()
    this.props.onDone()
  }

  render () {
    const feRows = this.renderFilterRows()

    return (
      <div className='filter-editor'>
        <div className='filter-editor-filter-pane'>
          <div className='filter-editor-select-row'>
            <div className='pt-select pt-minimal'>
              <select
                onChange={e => this.handleOpChange(e.target.value)}>
                <option value='$and'>All Of (AND)</option>
                <option value='$or'>Any Of (OR)</option>
              </select>
            </div>
          </div>
          <div className='filter-editor-edit-section'>
            <div className='filter-editor-scroll-pane'>
              {feRows}
              <div className='filter-editor-row'>
                <div className='filter-edit-add-row'>
                  <Button
                    className='pt-minimal'
                    iconName='add'
                    onClick={e => this.handleAddRow()}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className='filter-editor-footer'>
          <Button
            text='Cancel'
            onClick={e => this.props.onCancel(e)} />
          <Button
            disabled={!this.state.dirty}
            text='Apply'
            onClick={e => this.handleApply()} />
          <Button
            className='pt-intent-primary'
            onClick={e => this.handleDone()}
            text='Done' />
        </div>
      </div>
    )
  }
}
