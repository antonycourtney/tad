/* @flow */

import * as styles from '../less/easypivot.less'  // eslint-disable-line
require('../less/sidebar.less')
require('../less/columnSelector.less')
require('../less/columnList.less')
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import OneRef from 'oneref'
import AppPane from './components/AppPane'

import * as reltab from './reltab' // eslint-disable-line
import rtc from './reltab-electron'
import * as actions from './actions'

const md: reltab.FileMetadata = require('electron').remote.getGlobal('md')

console.log('Hello EasyPivot!')
console.log('metadata: ', md)

const tableName = md.tableName

const baseQuery = reltab.tableQuery(tableName)

actions.createAppState(rtc, md.tableName, baseQuery)
  .then(appState => {
    console.log('got initial app state: ', appState.toJS())

    const stateRef = new OneRef.Ref(appState)

    ReactDOM.render(
      <OneRef.AppContainer appClass={AppPane} stateRef={stateRef} />,
      document.getElementById('app')
    )
  })

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
