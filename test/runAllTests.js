/* @flow */
import * as fs from 'fs'

import 'console.table'
require('babel-polyfill')

var test = require('tape')
var tapeSnapInit = require('./tapeSnap')
var tapSpec = require('tap-spec')
// var summarize = require('tap-summary')
const commandLineArgs = require('command-line-args')

const optionDefinitions = [
  {
    name: 'update',
    type: Boolean,
    alias: 'u',
    description: 'update all snapshot tests (record-only mode)'
  }
]

/*
 * very important to explicitly run our tape test output
 * into tap-spec via node pipes rather than stdin / stdout.
 *
 * I found large auxiliary output (like console.log'ing a large table)
 * would encounter buffering issues when using stdin / stdout.
 *
 * Never isolated exact cause, but creating and managing stream in
 * Node explicitly seems to work.
 *
 * Unfortunately that tickles another issue: in-process streams
 * wouldn't print summary information:
 * See: https://github.com/scottcorgan/tap-spec/issues/37
 * and https://github.com/scottcorgan/tap-spec/issues/37#issuecomment-268949364
 * for my workaround.
 */

let htest = test.createHarness()

htest.createStream()
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

let tapeSnap = tapeSnapInit(htest)

const argv = process.argv.slice(1)
const options = commandLineArgs(optionDefinitions, argv)
if (options.update) {
  console.log('setting tapeSnap to record-only mode')
  tapeSnap.recordAll(true)
}

/*
 * Note (!): We have to pull these in via require() rather than ES6 import because
 * otherwise the import will happen before the above fetch() polyfill is initialized.
 */

// require('./reltabTests')
// require('./aggtreeTests')
// require('./csvImportTests')
require('./pathTreeTests')(htest)
require('./reltabSqliteTests')(htest)
