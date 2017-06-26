/* @flow */

/*
 * main module for render process
 */

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import OneRef from 'oneref'
import AppPane from './components/AppPane'
import PivotRequester from './PivotRequester'
import AppState from './AppState'
import ViewParams from './ViewParams'
import * as baseDialect from './dialects/base' // eslint-disable-line
import dialect from './dialects/sqlite'
import * as electronConnection from './drivers/electron'
import * as actions from './actions'
import log from 'electron-log'
import './styles'

require('babel-polyfill')

const remote = require('electron').remote

const remoteInitMain = remote.getGlobal('initMain')
const remoteErrorDialog = remote.getGlobal('errorDialog')

const ipcRenderer = require('electron').ipcRenderer

// TODO: DO SOME SHIT SO THAT tiStr IS REVIVED PROPERLY
const initMainProcess = (targetPath, srcFile): Promise<baseDialect.TableInfo> => {
  return new Promise((resolve, reject) => {
    remoteInitMain(targetPath, srcFile, (err, tiStr) => {
      if (err) {
        console.error('initMain error: ', err)
        reject(err)
      } else {
        const ti = dialect.deserializeTableInfo(tiStr)
        resolve(ti)
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
    viewParams = ViewParams.deserialize({ ...savedFileState.viewParams, dialect })
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
    .then(ti => {
      const baseQuery = dialect.tableQuery(ti)

      const rtc = electronConnection.init(dialect)

      // module local to keep alive:
      var pivotRequester: ?PivotRequester = null  // eslint-disable-line

      actions.initAppState(dialect, rtc, ti.tableName, baseQuery, viewParams, updater)
      pivotRequester = new PivotRequester(stateRef) // eslint-disable-line

      ipcRenderer.on('request-serialize-app-state', (event, req) => {
        console.log('got request-serialize-app-state: ', req)
        const {requestId} = req
        const curState = stateRef.getValue()
        const viewParamsJS = curState.viewState.viewParams.toJS()
        const serState = {targetPath, viewParams: viewParamsJS}
        console.log('current viewParams: ', viewParamsJS)
        ipcRenderer.send('response-serialize-app-state',
          {requestId, contents: serState})
      })
      ipcRenderer.on('set-show-hidden-cols', (event, val) => {
        actions.setShowHiddenCols(val, updater)
      })
    })
    .catch(err => {
      log.error('renderMain: caught error during initialization: ', err.message, err.stack)
      remoteErrorDialog('Error initializing Tad', err.message, true)
    })
}

init()
