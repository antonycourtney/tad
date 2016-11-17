/* @flow */
import * as Q from 'q'
import * as FS from 'fs'

import 'console.table'
// A fetch polyfill using ReadFile that assumes url is relative:
global.fetch = (url: string): Promise<any> => Q.nfcall(FS.readFile, url, 'utf-8').then(txt => ({ text: () => txt }))

/*
 * Note (!): We have to pull these in via require() rather than ES6 import because
 * otherwise the import will happen before the above fetch() polyfill is initialized.
 */
require('./reltabTests')
require('./aggtreeTests')
