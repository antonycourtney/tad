/* @flow */

import * as React from 'react'
import * as baseDialect from '../dialects/base'
import AppState from '../AppState'
// import type {Scalar} from '../dialect' // eslint-disable-line
import {Button, NumericInput} from '@blueprintjs/core'
import Select from 'react-select'

type RefUpdater = (f: ((s: AppState) => AppState)) => void
type Option = { value: string, label: string }
type OptionsRet = { options: [Option] }
type OptionsLoader = (input: string) => Promise<OptionsRet>

type FilterEditorRowState = { field?: baseDialect.Field, rhs?: any, op?: ?string }

const mkColValsLoader = (appState: AppState, field: baseDialect.Field): OptionsLoader => {
  const rtc = appState.rtc
  const baseQuery = appState.baseQuery
  return async (input:string): OptionsRet => {
    let dq = baseQuery.distinct(field)
    if (input.length > 0) {
      dq = dq.filter(appState.dialect.Condition.and().contains(field, input))
    }
    const qres = await rtc.evalQuery(dq, 0, 50)
    const colData = qres.rowData.map(r => r[field.selectableName]).filter(v => v != null)
    const options = colData.map(cv => ({value: cv, label: cv}))
    return { options }
  }
}

export default class FilterEditorRow extends React.Component {
  props: {
    appState: AppState,
    stateRefUpdater: RefUpdater,
    dialect: baseDialect.Dialect,
    schema: baseDialect.Schema,
    onDeleteRow: () => void,
    onUpdate: (fe: ?baseDialect.Filter) => void,
    filter: ?baseDialect.Filter
  }
  state: { filter: FilterEditorRowState }

  constructor (props: any) {
    super(props)
    console.log('FilterEditor: ctor: ', props)
    const { filter } = props

    let stateFilter = {}
    if (filter) {
      stateFilter = {
        field: filter.lhsAsField(this.props.schema),
        rhs: filter.rhs,
        op: filter.op
      }
    }

    this.state = {
      filter: stateFilter
    }
  }

  mkFilter (filter: FilterEditorRowState): baseDialect.Filter {
    // This should never happen, but makes flow happy
    if (!filter.field) {
      throw new Error('Cannot make filter without a field')
    }

    let rhs = filter.rhs
    if (['$in', '$nin'].includes(filter.op)) {
      rhs = rhs && rhs.map(option => option.value)
    }

    return filter.field.filter(filter.op, rhs)
  }

  /* validate row and notify if valid */
  handleUpdate (filter: FilterEditorRowState) {
    if (this.props.onUpdate && filter.field) {
      try {
        this.props.onUpdate(this.mkFilter(filter))
      }
      catch (err) {
        if (err instanceof baseDialect.InvalidFilterError) {
          this.props.onUpdate(null)
        }
        else {
          throw err
        }
      }
    }
  }

  handleColumnSelect (event: any) {
    const sval = event.target.value
    const field = (sval === '') ? null : this.props.schema.getField(sval)
    this.setState({ filter: { field, op: null, rhs: null } })
    this.handleUpdate({ ...this.state.filter, field })
  }

  handleOpSelect (event: any) {
    const sval = event.target.value
    const op = (sval === '') ? null : sval
    this.setState({ filter: { ...this.state.filter, op } })
    this.handleUpdate({ ...this.state.filter, op })
  }

  handleSelectChange (value: Array<Option>) {
    this.setState({ filter: { ...this.state.filter, rhs: value } })
    this.handleUpdate({ ...this.state.filter, rhs: value })
  }

  handleValueChange (value: any) {
    this.setState({ filter: { ...this.state.filter, rhs: value } })
    this.handleUpdate({ ...this.state.filter, rhs: value })
  }

  handleDeleteRow () {
    if (this.props.onDeleteRow) {
      this.props.onDeleteRow()
    }
  }

  renderColumnSelect () {
    const { schema } = this.props
    const { field } = this.state.filter
    const fieldChoices = schema.sortedFields()
    const colOpts = fieldChoices.map((f) => (
        <option
          key={'filterRowColSel-' + f.id}
          value={f.id}
        >
          {f.displayName}
        </option>
      )
    )

    const selectVal = (field == null) ? '' : field.id
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
    const { dialect } = this.props
    const { field, op } = this.state.filter
    let opChoices = []
    let disabled = false
    if (field != null) {
      const colType = field.type
      const ops = field.availableOps(colType)
      opChoices = ops.map((opc, idx) => (
        <option
          key={'relop-' + idx}
          value={opc}>{dialect.Filter.opDisplayName(opc)}</option>))
    } else {
      disabled = true
    }
    const opVal = (op === null) ? '' : op
    return (
      <div className='pt-select filter-row-op-select'>
        <select
          value={opVal}
          disabled={disabled}
          onChange={event => this.handleOpSelect(event)}
        >
          <option value=''>Operator...</option>
          {opChoices}
        </select>
      </div>
    )
  }

  renderValInput () {
    const { appState, dialect } = this.props
    const { field, op, rhs: value } = this.state.filter
    const disabled = (field == null) ||
      (op == null) || !(dialect.Filter.opIsBinary((op: any)))

    let inputComponent = null
    if (field != null) {
      const columnType = field.type
      if (dialect.Field.typeIsNumeric(columnType)) {
        inputComponent = (
          <NumericInput

            onValueChange={v => this.handleValueChange(v)}
            placeholder='Value'
            disabled={disabled}
            value={value}
          />)
      }
      if (inputComponent == null) {
        const compVal = value ? value : ''  // eslint-disable-line
        if ((op === '$in') || (op === '$nin')) {
          const loader = mkColValsLoader(appState, field)
/* Adding 'key' here as proposed workaround for
 * https://github.com/JedWatson/react-select/issues/1771
 */
          inputComponent = (
            <Select.Async
              className='filter-editor-value'
              name='in-op'
              value={compVal}
              key={compVal.length}
              multi
              loadOptions={loader}
              onChange={val => this.handleSelectChange(val)}
            />)
        } else {
          inputComponent = (
            <input
              className='pt-input filter-editor-value'
              type='text'
              placeholder='Value'
              disabled={disabled}
              value={compVal}
              onChange={e => this.handleValueChange(e.target.value)}
              dir='auto'
            />)
        }
      }
    }
    return inputComponent
  }

  render () {
    const colSelect = this.renderColumnSelect()
    const opSelect = this.renderOpSelect()
    const valInput = this.renderValInput()
    const clearStyle = {clear: 'both'}
    return (
      <div className='filter-editor-row'>
        <div className='filter-editor-row-predicate'>
          {colSelect}
          {opSelect}
          {valInput}
        </div>
        <Button
          className='pt-minimal'
          iconName='delete'
          onClick={e => this.handleDeleteRow()}
        />
        <div id='clear' style={clearStyle} />
      </div>
    )
  }
}
