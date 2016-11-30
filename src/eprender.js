/* @flow */

import * as styles from '../less/easypivot.less'  // eslint-disable-line
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import AppPane from './components/AppPane'

import * as reltab from './reltab' // eslint-disable-line
import rtc from './reltab-electron'
import PivotTreeModel from './PivotTreeModel'

const md: reltab.FileMetadata = require('electron').remote.getGlobal('md')

console.log('Hello EasyPivot!')
console.log('metadata: ', md)

const baseQuery = reltab.tableQuery(md.tableName)
const ptm = new PivotTreeModel(rtc, baseQuery, [])
ptm.openPath([])

/*
const baseQuery = reltab.tableQuery('bart-comp-all')
  .project([ 'JobFamily', 'Title', 'Union', 'Name', 'Base', 'TCOE' ])

var ptm = new PivotTreeModel(rtc, baseQuery, [ 'Union', 'JobFamily', 'Title' ])
ptm.openPath([])
ptm.openPath(['Non-Represented', 'Audit'])
ptm.openPath(['Non-Represented', 'Clerical'])
ptm.openPath(['Non-Represented', 'Information Systems'])
ptm.openPath(['Non-Represented', 'Information Systems', 'Manager of Information Systems'])
*/

ReactDOM.render(
  <AppPane ptm={ptm} />,
  document.getElementById('app')
)
