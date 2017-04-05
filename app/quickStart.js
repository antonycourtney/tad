const url = require('url')
const path = require('path')

const electron = require('electron')
const BrowserWindow = electron.BrowserWindow

let win = null

export const showQuickStart = () => {
  if (!win) {
    win = new BrowserWindow({
      width: 850,
      height: 600
    })
    win.loadURL(url.format({
      pathname: path.join(__dirname, 'quickstart.html'),
      protocol: 'file:',
      slashes: true
    }))
    win.on('close', e => {
      win = null
    })
  }
  win.show()
}
