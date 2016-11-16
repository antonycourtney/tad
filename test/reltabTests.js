/* @flow */
import test from 'tape'
import * as reltab from '../src/reltab' // eslint-disable-line
import * as util from './reltabTestUtils'

const {col, constVal} = reltab

import * as Q from 'q'
import * as FS from 'fs'

require('console.table')

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

const q1 = reltab.tableQuery('test-data/bart-comp-all.json')

var tcoeSum = 0

test('basic table read', t => {
  t.plan(5)
  reltab.local.evalQuery(q1).then(res => {
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

    // console.log(rowData[0])
    var expRow0 = ['Crunican, Grace', 'General Manager', 312461, 0, 3846, 19141, 37513,
      17500, 1869, 7591, 399921, 'MNP', 'Executive Management', 'Non-Represented']
    t.deepEqual(rowData[0], expRow0, 'first row matches expected')

    tcoeSum = util.columnSum(res, 'TCOE')
    console.log('TCOE sum: ', tcoeSum)

    t.end()
  })
})

const pcols = ['Job', 'Title', 'Union', 'Name', 'Base', 'TCOE']
const q2 = q1.project(pcols)

test('basic project operator', t => {
  t.plan(3)
  // console.log('q2: ', q2)
  reltab.local.evalQuery(q2).then(res => {
    t.ok(true, 'project query returned success')
    // console.log('project query schema: ', res.schema)
    t.deepEqual(res.schema.columns, pcols, 'result schema from project')

    // console.log(res.rowData[0])
    var expRow0 = ['Executive Management', 'General Manager', 'Non-Represented', 'Crunican, Grace', 312461, 399921]

    t.deepEqual(res.rowData[0], expRow0, 'project result row 0')
    t.end()
  })
})

const q3 = q1.groupBy(['Job', 'Title'], ['TCOE'])  // note: [ 'TCOE' ] equivalent to [ [ 'sum', 'TCOE' ] ]

test('basic groupBy', t => {
  reltab.local.evalQuery(q3).then(res => {
    // console.log('groupBy result: ', res)

    const expCols = ['Job', 'Title', 'TCOE']
    t.deepEqual(res.schema.columns, expCols, 'groupBy query schema')

    t.deepEqual(res.rowData.length, 380, 'correct number of grouped rows')

    const groupSum = util.columnSum(res, 'TCOE')
    t.equal(groupSum, tcoeSum, 'grouped TCOE sum matches raw sum')
    t.end()
  })
})

const q4 = q2.groupBy(['Job'], ['Title', 'Union', 'Name', 'Base', 'TCOE'])

test('groupBy aggs', t => {
  reltab.local.evalQuery(q4).then(res => {
    var rs = res.schema

    const expCols = ['Job', 'Title', 'Union', 'Name', 'Base', 'TCOE']
    t.deepEqual(rs.columns, expCols)

    t.deepEqual(res.rowData.length, 19, 'number of grouped rows in q4 result')

    const groupSum = util.columnSum(res, 'TCOE')
    t.deepEqual(groupSum, tcoeSum, 'tcoe sum after groupBy')
    t.end()
  }).fail(util.mkAsyncErrHandler(t, 'evalQuery q4'))
})

const q5 = q1.filter(reltab.and().eq(col('Job'), constVal('Executive Management')))

util.queryTest('basic filter', q5, (t, res) => {
  t.ok(res.rowData.length === 14, 'expected row count after filter')
  // console.table(res.schema.columns, res.rowData)
  t.end()
})

const q6 = q1.mapColumns({Name: {id: 'EmpName', displayName: 'Employee Name'}})
util.queryTest('mapColumns', q6, (t, res) => {
  const rs = res.schema
  t.ok(rs.columns[0], 'EmpName', 'first column key is employee name')
  const em = rs.columnMetadata['EmpName']
  t.deepEqual(em, {type: 'text', displayName: 'Employee Name'}, 'EmpName metadata')
  t.end()
})

var q7 = q1.mapColumnsByIndex({'0': {id: 'EmpName'}})
util.queryTest('mapColumnsByIndex', q7, (t, res) => {
  const rs = res.schema
  t.ok(rs.columns[0], 'EmpName', 'first column key is employee name')
  t.end()
})
