/* @flow */

/*
 * main module for render process
 */

import * as styles from '../less/app.less'  // eslint-disable-line
require('../less/sidebar.less')
require('../less/columnSelector.less')
require('../less/columnList.less')
require('../less/singleColumnSelect.less')

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import OneRef from 'oneref'
import AppPane from './components/AppPane'

import * as reltab from './reltab' // eslint-disable-line
import rtc from './reltab-electron'
import * as actions from './actions'

const md: reltab.FileMetadata = require('electron').remote.getGlobal('md')

console.log('renderMain started')
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
