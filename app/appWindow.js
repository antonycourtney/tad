
const url = require('url')
const path = require('path')
const electron = require('electron')
const BrowserWindow = electron.BrowserWindow
const dialog = electron.dialog

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindows = []

export const create = targetPath => {
  const win = new BrowserWindow({width: 1150, height: 910})

  win.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  win.webContents.openDevTools({mode: 'bottom'})
  win.webContents.closeDevTools()

  // Emitted when the window is closed.
  win.on('closed', function () {
    const idx = mainWindows.indexOf(win)
    if (idx) {
      delete mainWindows[idx]
    }
  })
  win.targetPath = targetPath
  mainWindows.push(win)
  return win
}

export const openDialog = () => {
  const openPaths = dialog.showOpenDialog({
    properties: [ 'openFile' ],
    filters: [
      {name: 'CSV files', extensions: ['csv']}
    ]
  })
  if (openPaths && openPaths.length > 0) {
    create(openPaths[0])
  }
}
