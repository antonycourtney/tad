/* @flow */
import * as fs from 'fs'

import 'console.table'
require('babel-polyfill')

var test = require('tape')
var tapSpec = require('tap-spec')

/*
 * very important to explicitly run our tape test output
 * into tap-spec via node pipes rather than stdin / stdout.
 *
 * I found large auxiliary output (like console.log'ing a large table)
 * would encounter buffering issues when using stdin / stdout.
 * Never isolated exact cause, but this workaround is adequate:
 */
test.createStream()
  .pipe(tapSpec())
  .pipe(process.stdout)

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

// require('./reltabTests')
// require('./aggtreeTests')
// require('./csvImportTests')
require('./reltabSqliteTests')
