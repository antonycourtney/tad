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

  handleDecimalsChange (event: any) {
    const opts = this.props.value
    const nextText = event.target.value
    this.setState({decimalsText: nextText})
    const decVal = Number.parseInt(nextText)
    console.log('handleDecimalsChange: "' + nextText + '" ==> ', decVal)
    if (isNaN(decVal) || (decVal < 0) || (decVal > 10)) {
      // ignore
      return
    }
    const nextOpts = opts.set('decimalPlaces', decVal)
    // explicitly check for value change
    if (this.props.onChange && decVal !== opts.decimalPlaces) {
      console.log('handleDecimalsChange: calling onChange with ', nextOpts.toJS())
      this.props.onChange(nextOpts)
    }
  }

  // slightly evil way to handle this.
  // Necessary because the same format panel object can be re-used with different props
  // when targeting a different column type or column
  componentWillReceiveProps (nextProps: any) {
    const opts = this.props.value
    const nextOpts = nextProps.value
    if (opts.decimalPlaces !== nextProps.decimalPlaces) {
      this.setState({ decimalsText: nextOpts.decimalPlaces.toString() })
    }
  }

  render () {
    const opts = this.props.value
    return (
      <div className='format-subpanel num-format-panel'>
        <Checkbox
          className='pt-condensed'
          checked={opts.commas}
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
      </div>
    )
  }
}
