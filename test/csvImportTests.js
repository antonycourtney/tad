/* @flow */
// import test from 'tape'
import db from 'sqlite'
import * as csvimport from '../src/csvimport'
import * as util from './reltabTestUtils'

const expRow0 = {
  Name: 'Crunican, Grace',
  Title: 'General Manager',
  Base: 312461,
  OT: 0,
  Other: 3846,
  MDV: 19141,
  ER: 37513,
  EE: 17500,
  DC: 1869,
  Misc: 7591,
  TCOE: 399921,
  Source: 'MNP',
  JobFamily: 'Executive Management',
  Union: 'Non-Represented'
}

const csvImportTest = async (t:any): any => {
  try {
    const testPath = 'csv/bart-comp-all.csv'
    const md = await csvimport.importSqlite(testPath, ',', {noHeaderRow: false})
    console.log('table import complete: ', md.tableName)
    t.ok(true, 'table import completed.')
    t.ok(md.tableName === 'bart-comp-all', 'tableName as expected')
    t.ok(md.rowCount === 2873, 'expected rowCount')
    const rows = await db.all('select * from \'' + md.tableName + '\' limit 10')
    console.log('read rows from sqlite table.')
    // console.log(rows)
    t.deepEqual(rows[0], expRow0, 'first row as expected')
    t.end()
  } catch (err) {
    console.error('caught exception in importSqlite: ', err, err.stack)
    t.fail(err)
  }
}

const runTests = () => {
  util.runSqliteTest('csv import', csvImportTest)
}
runTests()
