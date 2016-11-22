/* @flow */

// import * as styles from '../less/easypivot.less'

import * as reltab from './reltab' // eslint-disable-line
import rtc from './reltab-local'
import * as epslick from './epslick'
// import { Grid, Data, Formatters } from 'slickgrid-es6'
import PivotTreeModel from './PivotTreeModel'
import * as Q from 'q'

var fs = require('electron').remote.require('fs')

// A fetch polyfill using ReadFile that assumes url is relative:
// N.B. We do readFileSync here (rather than some async call) just for testing
window.fetch = (url: string): Promise<any> => {
  const deferred = Q.defer()

  const contents = fs.readFileSync(url)
  const response = { text: () => contents }
  deferred.resolve(response)
  return deferred.promise
}

console.log('Hello EasyPivot!')

const baseQuery = reltab.tableQuery('test-data/bart-comp-all.json')
  .project([ 'Job', 'Title', 'Union', 'Name', 'Base', 'TCOE' ])
const {col, constVal} = reltab
const q5 = baseQuery.filter(reltab.and().eq(col('Job'), constVal('Executive Management')))
rtc.evalQuery(q5).then(res => {
  console.log('q5 evaluation completed, result: ', res)
  console.table(res.rowData)
}, err => {
  console.error('q5 evaluation failed, error: ', err)
})

var ptm = new PivotTreeModel(rtc, baseQuery, [ 'Union', 'Job', 'Title' ])
ptm.openPath([])
ptm.openPath(['Non-Represented', 'Audit'])
ptm.openPath(['Non-Represented', 'Clerical'])
ptm.openPath(['Non-Represented', 'Information Systems'])
ptm.openPath(['Non-Represented', 'Information Systems', 'Manager of Information Systems'])
const sgv = epslick.sgView('#epGrid', ptm)
const sgc = epslick.sgController(sgv, ptm)  // eslint-disable-line
