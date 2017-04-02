/* @flow */

import * as Immutable from 'immutable'

export default class NumFormatOptions extends Immutable.Record({
  commas: true,
  decimalPlaces: 2
}) {
  commas: boolean
  decimalPlaces: number
}
