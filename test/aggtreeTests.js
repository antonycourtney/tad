/* @flow */

import * as reltab from '../src/reltab'
import * as aggtree from '../src/aggtree'
import * as util from './reltabTestUtils'

const pcols = ['Job', 'Title', 'Union', 'Name', 'Base', 'TCOE']
const q0 = reltab.tableQuery('test-data/bart-comp-all.json').project(pcols)

const p0 = aggtree.vpivot(reltab.local, q0, ['Job', 'Title'])

p0.then(tree0 => {
  console.log('vpivot initial promise resolved...')
  const rq0 = tree0.rootQuery
  console.log('root query: ', rq0)
  util.queryTest('root query', rq0, (t, res) => {
    util.logTable(res)
    t.end()
  })
})
