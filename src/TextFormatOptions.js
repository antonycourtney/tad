/* @flow */

import * as Immutable from 'immutable'

export default class TextFormatOptions extends Immutable.Record({
  urlsAsHyperlinks: true
}) {
  urlsAsHyperlinks: boolean
}
