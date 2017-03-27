const db = require('sqlite')
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
const dialog = electron.dialog
const app = electron.app

const path = require('path')

const pkgInfo = require('../package.json')

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
 */
const mkInitMain = (options) => (path, cb) => {
  let md
  try {
    const hrProcStart = process.hrtime()
    db.open(':memory:')
      // .then(() => csvimport.importSqlite(path))
      .then(() => csvimport.fastImport(path))
      .then(importMd => {
        const [es, ens] = process.hrtime(hrProcStart)
        console.info('runQuery: import completed in %ds %dms', es, ens / 1e6)
        md = importMd
        let rtOptions = {}
        if (options['show-queries']) {
          rtOptions.showQueries = true
        }
        return reltabSqlite.init(db, md, rtOptions)
      })
      .then(rtc => {
        console.log('completed reltab initalization.')
        // Now let's place a function in global so it can be run via remote:
        global.runQuery = runQuery(rtc)
        global.getRowCount = getRowCount(rtc)
        const mdStr = JSON.stringify(md, null, 2)
        cb(null, mdStr)
      })
      .catch(err => {
        cb(err, null)
      })
  } catch (err) {
    console.error('Error during app initialization: ', err)
    cb(err, null)
  }
}

// App initialization:
const appInit = (options) => {
  global.initMain = mkInitMain(options)
  global.errorDialog = errorDialog
  appMenu.createMenu()
}

const optionDefinitions = [
  {
    name: 'csvfile',
    type: String,
    defaultOption: true,
    typeLabel: '[underline]{file}.csv',
    description: 'CSV file to view, with header row'
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
      '$ tad [[italic]{options}] [underline]{file}.csv'
    ]
  },
  {
    header: 'Options',
    optionList: optionDefinitions.filter(opt => opt.name !== 'csvfile')
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

const main = () => {
  setup.postInstallCheck()
  log.info('starting Tad, version ', app.getVersion())
  try {
    process.on('uncaughtException', function (error) {
      log.error(error.message)
      log.error(error.stack)
      reportFatalError(error.message)
    })
    const argv = process.argv.slice(1)
    // deal with weird difference between starting from npm and starting
    // from packaged shell wrapper:
    if (!argv[0].startsWith('--executed-from')) {
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
      let targetPath = null
      const srcDir = options['executed-from']
      if (srcDir && options.csvfile && !(options.csvfile.startsWith('/'))) {
        // relative path -- prepend executed-from
        targetPath = path.join(srcDir, options.csvfile)
      } else {
        // absolute pathname or no srcDir:
        targetPath = options.csvfile
      }
      global.options = options

      // This method will be called when Electron has finished
      // initialization and is ready to create browser windows.
      // Some APIs can only be used after this event occurs.
      app.on('ready', () => {
        appInit(options)
        console.log('app.ready handler: done with appInit')
        if (targetPath) {
          appWindow.create(targetPath)
        } else {
          appWindow.openDialog()
        }
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
    }
  } catch (err) {
    reportFatalError(err.message)
    log.error('Error: ', err.message)
    log.error(err.stack)
    showUsage()
    app.quit()
  }
}

main()
