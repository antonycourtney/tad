/* @flow */

import * as reltab from '../src/reltab'
import rtc from '../src/reltab-local'
import * as aggtree from '../src/aggtree'
import * as util from './reltabTestUtils'

const pcols = ['Job', 'Title', 'Union', 'Name', 'Base', 'TCOE']
const q0 = reltab.tableQuery('test-data/bart-comp-all.json').project(pcols)

const p0 = aggtree.vpivot(rtc, q0, ['Job', 'Title'], null, true, [])

p0.then(tree0 => {
  console.log('vpivot initial promise resolved...')
  const rq0 = tree0.rootQuery
  util.queryTest('root query', rq0, (t, res) => {
    console.log('root query: ', rq0)
    util.logTable(res)
    t.end()
  })

  const q1 = tree0.applyPath([])
  util.queryTest('open root', q1, (t, res) => {
    console.log('open root query: ', q1)
    util.logTable(res)
    const expCols = ['_depth', '_pivot', '_path', 'Job', 'Title', 'Union', 'Name', 'Base', 'TCOE', 'Rec']

    t.deepEqual(res.schema.columns, expCols, 'Q1 schema columns')
    t.deepEqual(res.rowData.length, 19, 'Q1 rowData length')

    const actSum = util.columnSum(res, 'TCOE')

    t.deepEqual(actSum, 349816190, 'Q1 rowData sum(TCOE)')
    t.end()
  })

  const q2 = tree0.applyPath([ 'Executive Management' ])
  util.queryTest('query for path /"Executive Management"', q2, (t, res) => {
    util.logTable(res)
    t.end()
  })

  var q3 = tree0.applyPath(['Executive Management', 'General Manager'])
  util.queryTest('query for path /Executive Management/General Manager ', q3, (t, res) => {
    util.logTable(res)
    t.end()
  })

  var openPaths = {'Executive Management': {'General Manager': {}}, 'Safety': {}}

  var q4 = tree0.getTreeQuery(openPaths)
  util.queryTest('treeQuery', q4, (t, res) => {
    util.logTable(res)
    t.end()
  })
})
