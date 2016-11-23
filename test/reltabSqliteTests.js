/* @flow */

import db from 'sqlite'
import * as reltab from '../src/reltab'
import * as reltabSqlite from '../src/reltab-sqlite'
import * as csvimport from '../src/csvimport'
import * as util from './reltabTestUtils'

const q1 = reltab.tableQuery('bart-comp-all')

var tcoeSum

const dbTest0 = (rtc, t) => {
  return rtc.evalQuery(q1)
    .then(res => {
      t.ok(true, 'basic table read')
      var schema = res.schema
      var expectedCols = ['Name', 'Title', 'Base', 'OT', 'Other', 'MDV', 'ER',
                        'EE', 'DC', 'Misc', 'TCOE', 'Source', 'JobFamily', 'Union']

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
}

const testPath = 'csv/bart-comp-all.csv'

const runTests = () => {
  util.runSqliteTest('dbTest0', t => {
    return csvimport.importSqlite(testPath)
      .then(md => reltabSqlite.init(db, md))
      .then(rtc => dbTest0(rtc, t))
      .catch(err => console.error('reltabSqliteTests: ', err, err.stack))
  })
}
runTests()
