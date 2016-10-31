/* @flow */
import test from 'tape'
import * as reltab from '../src/reltab' // eslint-disable-line

const {col, constVal} = reltab

import * as Q from 'q'
import * as FS from 'fs'

// A fetch polyfill using ReadFile that assumes url is relative:
global.fetch = (url: string): Promise<any> => Q.nfcall(FS.readFile, url, 'utf-8').then(txt => ({ text: () => txt }))

// require('es6-promise').polyfill()
// require('isomorphic-fetch')

test('trivial test', (t) => {
  t.plan(1)
  t.ok(true, 'trivial truth value')
  t.end()
})

test('reltab filter expressions', (t) => {
  t.plan(3)
  const e1 = reltab.and()

  const e1s = JSON.stringify(e1)
  t.ok(e1s === '{"expType":"FilterExp","op":"AND","opArgs":[]}', 'basic json encoding')

  const e2 = e1.eq(col('x'), constVal(30))
  const e2s = e2.toSqlWhere()
  t.ok(e2s === 'x=30', 'basic toSqlWhere')

  const e3 = e2.eq(col('y'), constVal('hello'))
  const e3s = e3.toSqlWhere()
  t.ok(e3s === "x=30 AND y='hello'", 'compound toSqlWhere')

  const e4 = e3.subExp(reltab.or().gt(col('z'), constVal(50)).gt(col('a'), col('b')))

  const e4s = e4.toSqlWhere()

  console.log('e4s.toSqlWhere: ', e4s)

  t.end()
})

test('basic table read', (t) => {
  t.plan(5)
  const tq = reltab.tableQuery('test-data/bart-comp-all.json')
  reltab.local.evalQuery(tq).then(res => {
    t.ok(true, 'basic table read')
    var schema = res.schema
    var expectedCols = ['Name', 'Title', 'Base', 'OT', 'Other', 'MDV', 'ER',
                      'EE', 'DC', 'Misc', 'TCOE', 'Source', 'Job', 'Union']

    const columns = schema.columns // array of strings
    // console.log('columns: ', columns)

    t.deepEqual(columns, expectedCols, 'getSchema column ids')

    const columnTypes = columns.map(colId => schema.columnType(colId))
    var expectedColTypes = ['text', 'text', 'integer', 'integer', 'integer',
      'integer', 'integer', 'integer', 'integer', 'integer', 'integer', 'text', 'text', 'text']

    t.deepEqual(columnTypes, expectedColTypes, 'getSchema column types')

    const rowData = res.rowData
    t.equal(rowData.length, 2873, 'q1 rowData.length')

    console.log(rowData[0])

    var expRow0 = ['Crunican, Grace', 'General Manager', 312461, 0, 3846, 19141, 37513,
      17500, 1869, 7591, 399921, 'MNP', 'Executive Management', 'Non-Represented']

    t.deepEqual(rowData[0], expRow0, 'first row matches expected')
    t.end()
  })
})
