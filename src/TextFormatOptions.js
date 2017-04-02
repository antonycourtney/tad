/* @flow */

import * as Immutable from 'immutable'
import urlRegex from 'url-regex'
const shell = require('electron').shell

// install this globally so we can access in generated a tag:
window.tadOpenExternal = (url: string) => {
  console.log('tadOpenExternal: ', url)
  shell.openExternal(url)
  return false
}

const isValidURL = s => urlRegex({exact: true}).test(s)

export default class TextFormatOptions extends Immutable.Record({
  urlsAsHyperlinks: true
}) {
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
