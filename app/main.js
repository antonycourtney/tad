const db = require('sqlite')
const reltab = require('../src/reltab')
const commandLineArgs = require('command-line-args')
const getUsage = require('command-line-usage')
const reltabSqlite = require('../src/reltab-sqlite')
const csvimport = require('../src/csvimport')

const electron = require('electron')
const dialog = electron.dialog
const app = electron.app
const BrowserWindow = electron.BrowserWindow

const path = require('path')
const url = require('url')

const pkgInfo = require('../package.json')

require('console.table')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  mainWindow = new BrowserWindow({width: 1150, height: 910})

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  mainWindow.webContents.openDevTools({mode: 'bottom'})
  mainWindow.webContents.closeDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

// Can insert delay in promise chain by:
// delay(amount).then(() => ...)
let delay = ms => {
  console.log('injecting delay of ', ms, ' ms')
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
          cb(serRes)
        })
        .catch(err => console.error('error running query: ', err, err.stack))
    })
  } catch (err) {
    console.error('runQuery: ', err, err.stack)
  }
}

// App initialization:
const appInit = (options, path) => {
  try {
    console.log('appInit: entry')
    db.open(':memory:')
      .then(() => csvimport.importSqlite(path))
      .then(md => {
        global.md = md
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
        createWindow()
      })
      .catch(err => {
        console.error('*** Error: ', err.message)
        app.quit()
      })
  } catch (err) {
    console.error('Error during app initialization: ', err)
  }
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

const main = () => {
  try {
    process.on('uncaughtException', function (error) {
      reportFatalError(error.message)
    })
    const argv = process.argv.slice(1)
    const options = commandLineArgs(optionDefinitions, argv)
    if (options.help) {
      showUsage()
      app.quit()
    }
    if (options.version) {
      showVersion()
      app.quit()
    }
    let targetPath = null
    if (options['executed-from']) {
      if (options.csvfile && options.csvfile.startsWith('/')) {
        // absolute pathname:
        targetPath = options.csvfile
      } else {
        targetPath = path.join(options['executed-from'], options.csvfile)
      }
    } else {
      targetPath = options.csvfile
    }
    global.options = options

    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    app.on('ready', () => appInit(options, targetPath))

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
      if (mainWindow === null) {
        createWindow()
      }
    })
  } catch (err) {
    reportFatalError(err.message)
    console.error('Error: ', err.message)
    showUsage()
    app.quit()
  }
}

main()
