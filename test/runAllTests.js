/* @flow */
import * as fs from 'fs'

import 'console.table'

// A fetch polyfill using ReadFile that assumes url is relative:
function readFileAsync (file, options) {
  return new Promise(function (resolve, reject) {
    fs.readFile(file, options, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

global.fetch = (url: string): Promise<any> => readFileAsync(url, 'utf-8').then(txt => ({ text: () => txt }))

/*
 * Note (!): We have to pull these in via require() rather than ES6 import because
 * otherwise the import will happen before the above fetch() polyfill is initialized.
 */

require('./reltabTests')
require('./aggtreeTests')
require('./csvImportTests')
require('./reltabSqliteTests')
