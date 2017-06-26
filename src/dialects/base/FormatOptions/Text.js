/* @flow */

import * as Immutable from 'immutable'
import urlRegex from 'url-regex'

const isValidURL = s => urlRegex({exact: true}).test(s)

export default class TextFormatOptions extends Immutable.Record({
  type: 'TextFormatOptions',
  urlsAsHyperlinks: true
}) {
  type: string
  urlsAsHyperlinks: boolean

  getFormatter () {
    const ff = (val: ?string): ?string => {
      if (this.urlsAsHyperlinks &&
          val &&
          isValidURL(val)) {
        const ret =
`<a href="${val}" onclick='tadOpenExternal("${val}"); return false;'>${val}</a>`
        return ret
      }
      return val
    }
    return ff
  }
}
