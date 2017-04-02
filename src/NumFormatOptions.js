/* @flow */

import * as Immutable from 'immutable'

export default class NumFormatOptions extends Immutable.Record({
  commas: true,
  decimalPlaces: 2
}) {
  commas: boolean
  decimalPlaces: number

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
      return val.toLocaleString(undefined, fmtOpts)
    }
    return ff
  }
}
