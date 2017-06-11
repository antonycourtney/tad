/* @flow */

import * as React from 'react'
import { Checkbox } from '@blueprintjs/core'

export default class NumFormatPanel extends React.Component {
  state: {decimalsText: string}
  constructor (props: any) {
    super(props)
    const opts = this.props.value
    this.state = { decimalsText: opts.decimalPlaces.toString() }
  }

  handleCommasChange (event: any) {
    const opts = this.props.value
    const checkVal = event.target.checked
    const nextOpts = opts.set('commas', checkVal)
    if (this.props.onChange) {
      this.props.onChange(nextOpts)
    }
  }

  handleExponentialChange (event: any) {
    const opts = this.props.value
    const checkVal = event.target.checked
    const nextOpts = opts.set('exponential', checkVal)
    if (this.props.onChange) {
      this.props.onChange(nextOpts)
    }
  }

  handleDecimalsChange (event: any) {
    const opts = this.props.value
    const nextText = event.target.value
    this.setState({decimalsText: nextText})
    const decVal = Number.parseInt(nextText)
    let nextDec
    if ((nextText.length === 0) || isNaN(decVal) ||
        (decVal < 0) || (decVal > 10)) {
      nextDec = null
    } else {
      nextDec = decVal
    }
    const nextOpts = opts.set('decimalPlaces', nextDec)
    // explicitly check for value change
    if (this.props.onChange && decVal !== opts.decimalPlaces) {
      this.props.onChange(nextOpts)
    }
  }

  // slightly evil way to handle this.
  // Necessary because the same format panel object can be re-used with different props
  // when targeting a different column type or column
  componentWillReceiveProps (nextProps: any) {
    const opts = this.props.value
    const nextOpts = nextProps.value
    const nextDec = nextOpts.decimalPlaces
    if (opts.decimalPlaces !== nextDec) {
      const decStr = nextDec ? nextDec.toString() : ''
      this.setState({ decimalsText: decStr })
    }
  }

  render () {
    const opts = this.props.value
    return (
      <div className='format-subpanel num-format-panel'>
        <Checkbox
          className='pt-condensed'
          checked={opts.commas}
          disabled={opts.exponential}
          onChange={event => this.handleCommasChange(event)}
          label='Use (,) as 1000s Separator'
        />
        <label className='pt-label pt-inline'>
          Decimal Places
          <input
            className='pt-input'
            type='text'
            value={this.state.decimalsText}
            onChange={event => this.handleDecimalsChange(event)}
          />
        </label>
        <Checkbox
          className='pt-condensed'
          checked={opts.exponential}
          onChange={event => this.handleExponentialChange(event)}
          label='Use Scientific (exponential) Notation'
        />
      </div>
    )
  }
}
