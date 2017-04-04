/* @flow */

/*
 * main module for render process
 */

import * as styles from '../less/app.less'  // eslint-disable-line
require('../less/sidebar.less')
require('../less/columnSelector.less')
require('../less/columnList.less')
require('../less/singleColumnSelect.less')
require('../less/modal.less')

require('babel-polyfill')

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import OneRef from 'oneref'
import AppPane from './components/AppPane'
import PivotRequester from './PivotRequester'
import AppState from './AppState'
import ViewParams from './ViewParams'
import * as reltab from './reltab' // eslint-disable-line
import * as reltabElectron from './reltab-electron'
import * as actions from './actions'

const remote = require('electron').remote

const remoteInitMain = remote.getGlobal('initMain')
const remoteErrorDialog = remote.getGlobal('errorDialog')

const ipcRenderer = require('electron').ipcRenderer

const initMainProcess = (targetPath, srcFile): Promise<reltab.FileMetadata> => {
  return new Promise((resolve, reject) => {
    remoteInitMain(targetPath, srcFile, (err, mdStr) => {
      if (err) {
        console.error('initMain error: ', err)
        reject(err)
      } else {
        const md = JSON.parse(mdStr)
        resolve(md)
      }
    })
  })
}

const init = () => {
  const openParams = remote.getCurrentWindow().openParams
  let targetPath
  let srcFile = null
  let viewParams = null
  if (openParams.fileType === 'csv') {
    targetPath = openParams.targetPath
  } else if (openParams.fileType === 'tad') {
    const parsedFileState = JSON.parse(openParams.fileContents)
    // This would be the right place to validate / migrate tadFileFormatVersion
    const savedFileState = parsedFileState.contents
    targetPath = savedFileState.targetPath
    srcFile = openParams.srcFile
    viewParams = ViewParams.deserialize(savedFileState.viewParams)
  }

  const appState = new AppState({ targetPath })
  const stateRef = new OneRef.Ref(appState)
  const updater = OneRef.refUpdater(stateRef)

  ReactDOM.render(
    <OneRef.AppContainer appClass={AppPane} stateRef={stateRef} />,
    document.getElementById('app')
  )

  // and kick off main process initialization:
  initMainProcess(targetPath, srcFile)
    .then(md => {
      const tableName = md.tableName
      const baseQuery = reltab.tableQuery(tableName)

      const rtc = reltabElectron.init()

      // module local to keep alive:
      var pivotRequester: ?PivotRequester = null  // eslint-disable-line

      actions.initAppState(rtc, md.tableName, baseQuery, viewParams, updater)
        .then(() => {
          pivotRequester = new PivotRequester(stateRef) // eslint-disable-line

          ipcRenderer.on('request-serialize-app-state', (event, req) => {
            console.log('got request-serialize-app-state: ', req)
            const { requestId } = req
            const curState = stateRef.getValue()
            const viewParamsJS = curState.viewState.viewParams.toJS()
            const serState = { targetPath, viewParams: viewParamsJS }
            console.log('current viewParams: ', viewParamsJS)
            ipcRenderer.send('response-serialize-app-state',
              { requestId, contents: serState })
          })
        })
    })
    .catch(err => {
      remoteErrorDialog('Error initializing Tad', err.message, true)
    })
}

init()
