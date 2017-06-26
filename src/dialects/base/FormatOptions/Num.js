/* @flow */

import * as Immutable from 'immutable'

export default class NumFormatOptions extends Immutable.Record({
  type: 'NumFormatOptions',
  commas: true,
  decimalPlaces: 2,
  exponential: false
}) {
  type: string
  commas: boolean
  decimalPlaces: ?number
  exponential: boolean

  getFormatter () {
    const fmtOpts = {
      minimumFractionDigits: this.decimalPlaces,
      maximumFractionDigits: this.decimalPlaces,
      useGrouping: this.commas
    }
    const ff = (val: ?number): ?string => {
      if (val == null) {
        return null
      }
      let ret
      if (this.exponential) {
        if (this.decimalPlaces) {
          ret = val.toExponential(this.decimalPlaces)
        } else {
          ret = val.toExponential()
        }
      } else {
        ret = val.toLocaleString(undefined, fmtOpts)
      }
      return ret
    }
    return ff
  }
}
