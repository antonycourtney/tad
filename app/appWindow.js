
const url = require('url')
const path = require('path')
const electron = require('electron')
const BrowserWindow = electron.BrowserWindow
const dialog = electron.dialog

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindows = []
let openCount = 0
let baseX = 0
let baseY = 0
const POS_OFFSET = 25 // pixel offset of new windows
export const create = targetPath => {
  const winProps = {width: 1150, height: 910}
  if (openCount > 0) {
    winProps.x = baseX + openCount * POS_OFFSET
    winProps.y = baseY + openCount * POS_OFFSET
  }
  const win = new BrowserWindow(winProps)
  if (openCount === 0) {
    // first window:
    const bounds = win.getBounds()
    baseX = bounds.x
    baseY = bounds.y
  }

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
  openCount += 1
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
