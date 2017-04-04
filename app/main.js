const reltab = require('../src/reltab')
const commandLineArgs = require('command-line-args')
const getUsage = require('command-line-usage')
const reltabSqlite = require('../src/reltab-sqlite')
const csvimport = require('../src/csvimport')
const log = require('electron-log')
const setup = require('./setup')
const appMenu = require('./appMenu')
const appWindow = require('./appWindow')
const electron = require('electron')
const fs = require('fs')
const dialog = electron.dialog
const app = electron.app

const path = require('path')

const pkgInfo = require('../package.json')

require('babel-polyfill')
require('console.table')

// Can insert delay in promise chain by:
// delay(amount).then(() => ...)
let delay = ms => {
  if (ms > 0) {
    console.log('injecting delay of ', ms, ' ms')
  }
  return new Promise(resolve => setTimeout(resolve, ms))
}

const runQuery = rtc => (queryStr, cb) => {
  try {
    console.info('\n%s: runQuery: got query', new Date().toLocaleTimeString())
    const req = reltab.deserializeQueryReq(queryStr)
    const hrstart = process.hrtime()
    delay(0)
    .then(() => {
      const qp = (req.offset !== undefined) ? rtc.evalQuery(req.query, req.offset, req.limit) : rtc.evalQuery(req.query)
      qp
        .then(res => {
          const [es, ens] = process.hrtime(hrstart)
          console.info('runQuery: evaluated query in %ds %dms', es, ens / 1e6)
          const serRes = JSON.stringify(res, null, 2)
          cb(null, serRes)
        })
        .catch(err => {
          console.error('runQuery: error running query: ', err, err.stack)
          cb(err, null)
        })
    })
  } catch (err) {
    console.error('runQuery: ', err, err.stack)
  }
}

const getRowCount = rtc => (queryStr, cb) => {
  try {
    console.info('\n%s: getRowCount: got query', new Date().toLocaleTimeString())
    const req = reltab.deserializeQueryReq(queryStr)
    const hrstart = process.hrtime()
    delay(0)
    .then(() => {
      const qp = rtc.rowCount(req.query)
      qp
        .then(rowCount => {
          const [es, ens] = process.hrtime(hrstart)
          console.info('getRowCount: evaluated query in %ds %dms', es, ens / 1e6)
          const resObj = { rowCount }
          const serRes = JSON.stringify(resObj, null, 2)
          cb(null, serRes)
        })
        .catch(err => {
          console.error('getRowCount: error running query: ', err.message)
          cb(err, null)
        }
      )
    })
  } catch (err) {
    console.error('runQuery: ', err, err.stack)
  }
}

/*
 * main process initialization
 *
 * invoked via electron remote
 *
 * arguments:
 * pathname -- path to CSV file we are opening
 * srcfile (optional) -- path we are opening from
 */
const initMainAsync = async (options, pathname, srcfile) => {
  console.log('initMainAsync: options: ', options)
  const hrProcStart = process.hrtime()
  let rtOptions = {}
  if (options['show-queries']) {
    rtOptions.showQueries = true
  }
  const rtc = await reltabSqlite.getContext(rtOptions)

  // check if pathname exists
  if (!fs.existsSync(pathname)) {
    let found = false
    let srcdir = null
    let srcDirTarget = null
    log.warn('initMain: pathname not found: ', pathname)
    const basename = path.basename(pathname)
    if (srcfile) {
      srcdir = path.dirname(srcfile)
      srcDirTarget = path.join(srcdir, basename)
      if (fs.existsSync(srcDirTarget)) {
        log.warn('initMain: using ' + srcDirTarget + ' instead')
        pathname = srcDirTarget
        found = true
      }
    }
    if (!found) {
      let msg = '"' + pathname + '": file not found.'
      if (srcdir) {
        msg += '\n(Also tried "' + srcDirTarget + '")'
      }
      throw new Error(msg)
    }
  }

  // could also call: csvimport.importSqlite(pathname)
  const md = await csvimport.fastImport(pathname)
  rtc.addImportedTable(md)
  const [es, ens] = process.hrtime(hrProcStart)
  console.info('runQuery: import completed in %ds %dms', es, ens / 1e6)
  console.log('completed reltab initalization.')
  // Now let's place a function in global so it can be run via remote:
  global.runQuery = runQuery(rtc)
  global.getRowCount = getRowCount(rtc)
  const mdStr = JSON.stringify(md, null, 2)
  return mdStr
}

const mkInitMain = (options) => (pathname, srcfile, cb) => {
  initMainAsync(options, pathname, srcfile)
    .then(mdStr => cb(null, mdStr))
    .catch(err => cb(err, null))
}

// App initialization:
const appInit = (options) => {
  // console.log('appInit: ', options)
  global.initMain = mkInitMain(options)
  global.errorDialog = errorDialog
  appMenu.createMenu()
  // console.log('appInit: done')
}

const optionDefinitions = [
  {
    name: 'srcfile',
    type: String,
    defaultOption: true,
    typeLabel: '[underline]{file}.csv or [underline]{file}.tad',
    description: 'CSV file(.csv with header row) or Tad(.tad) file to view'
  },
  {
    name: 'executed-from',
    type: String,
    description: 'pathname to working directory'
  },
  {
    name: 'foreground',
    alias: 'f',
    type: Boolean,
    description: 'keep in foreground'
  },
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Show usage information'
  },
  {
    name: 'hidden-cols',
    type: Boolean,
    description: 'Show hidden columns (for debugging)'
  },
  {
    name: 'show-queries',
    type: Boolean,
    description: 'Show generated SQL queries on console when in foreground'
  },
  {
    name: 'version',
    alias: 'v',
    type: Boolean,
    description: 'Print version number and exit'
  }
]

const usageInfo = [
  {
    header: 'Tad',
    content: 'A viewer for tabular data.'
  },
  {
    header: 'Synopsis',
    content: [
      '$ tad [[italic]{options}] [underline]{file}.csv',
      '$ tad [[italic]{options}] [underline]{file}.tad'
    ]
  },
  {
    header: 'Options',
    optionList: optionDefinitions.filter(opt => opt.name !== 'srcfile')
  }
]

const showVersion = () => {
  const version = pkgInfo.version
  console.log(version)
}

const showUsage = () => {
  const usage = getUsage(usageInfo)
  console.log(usage)
}

const reportFatalError = (msg: string) => {
  dialog.showErrorBox('Error starting Tad', msg)
  app.quit()
}

const errorDialog = (title: string, msg: string, fatal = false) => {
  dialog.showErrorBox(title, msg)
  if (fatal) {
    app.quit()
  }
}

// construct targetPath based on options:
const getTargetPath = (options, filePath) => {
  let targetPath = null
  const srcDir = options['executed-from']
  if (srcDir && filePath && !(filePath.startsWith('/'))) {
    // relative path -- prepend executed-from
    targetPath = path.join(srcDir, filePath)
  } else {
    // absolute pathname or no srcDir:
    targetPath = filePath
  }
  return targetPath
}

let openFilePath = null

// callback for app.makeSingleInstance:
const initApp = firstInstance => (instanceArgv, workingDirectory) => {
  log.warn('initApp: ', firstInstance, instanceArgv, workingDirectory)
  try {
    const argv = instanceArgv.slice(1)
    // deal with weird difference between starting from npm and starting
    // from packaged shell wrapper:
    if (argv && (argv.length > 0) && !(argv[0].startsWith('--executed-from'))) {
      // npm / electron start -- passes '.' as first argument
      argv.unshift('--executed-from')
    }
    const options = commandLineArgs(optionDefinitions, {argv})
    let quickExit = false
    if (options.help) {
      showUsage()
      quickExit = true
    }
    if (options.version) {
      showVersion()
      quickExit = true
    }
    if (quickExit) {
      app.quit()
    } else {
      const targetPath = getTargetPath(options, options.srcfile)

      // set at end of ready event handler:
      let isReady = false

      // This method will be called when Electron has finished
      // initialization and is ready to create browser windows.
      // Some APIs can only be used after this event occurs.
      if (firstInstance) {
        const handleOpen = (event, filePath) => {
          console.log('handleOpen called!')
          log.warn('got open-file event for: ', filePath)
          event.preventDefault()
          const targetPath = getTargetPath(options, filePath)
          if (isReady) {
            log.warn('open-file: app is ready, opening in new window')
            appWindow.create(targetPath)
          } else {
            openFilePath = targetPath
            log.warn('open-file: set openFilePath ' + targetPath)
          }
        }

        app.on('open-file', handleOpen)
        app.on('open-url', (event, url) => {
          log.warn('got open-url: ', event, url)
          handleOpen(event, url)
        })
        setup.postInstallCheck()
        process.on('uncaughtException', function (error) {
          log.error(error.message)
          log.error(error.stack)
          reportFatalError(error.message)
        })

        // Quit when all windows are closed.
        app.on('window-all-closed', function () {
          // On OS X it is common for applications and their menu bar
          // to stay active until the user quits explicitly with Cmd + Q
          if (process.platform !== 'darwin') {
            app.quit()
          }
        })
        app.on('activate', function () {
          // On OS X it's common to re-create a window in the app when the
          // dock icon is clicked and there are no other windows open.
        })
        app.on('ready', () => {
          // const startMsg = `pid ${process.pid}: Tad started, version: ${app.getVersion()}`
          // console.log(startMsg)
          // dialog.showMessageBox({ message: startMsg })
          appInit(options)
          if (targetPath) {
            appWindow.create(targetPath)
          }
          if (openFilePath) {
            const openMsg = `pid ${process.pid}: Got open-file for ${openFilePath}`
            log.warn(openMsg)
            appWindow.create(openFilePath)
            // dialog.showMessageBox({ message: openMsg })
          } else {
            if (!targetPath) {
              appWindow.openDialog()
            }
          }
          isReady = true
        })
      } else {
        if (targetPath) {
          appWindow.create(targetPath)
        } else {
          log.warn('initApp called with no targetPath')
          app.focus()
          // appWindow.openDialog()
        }
      }
    }
  } catch (err) {
    reportFatalError(err.message)
    log.error('Error: ', err.message)
    log.error(err.stack)
    showUsage()
    app.quit()
  }
}

const main = () => {
  log.warn('Tad started, argv: ', process.argv)
  const shouldQuit = false
//  const shouldQuit = app.makeSingleInstance(initApp(false))
//  log.warn('After call to makeSingleInstance: ', shouldQuit)
  if (shouldQuit) {
    app.quit()
  } else {
    // first instance:
    initApp(true)(process.argv, null)
  }
}

main()
