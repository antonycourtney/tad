
import * as updater from './updater'
import * as appWindow from './appWindow'
import * as quickStart from './quickStart'
const electron = require('electron')

const Menu = electron.Menu

const isDarwin = process.platform === 'darwin'

let appMenu = null

const separatorMenuItem = { type: 'separator' }

const aboutTadMenuItem = () => {
  return {
    label: 'About Tad',
    role: 'about'
  }
}
const checkForUpdateMenuItem = () => {
  return {
    label: 'Check for Updates',
    click: updater.checkForUpdates
  }
}
export const createMenu = () => {
  const fileSubmenu = [
    {
      label: 'Open...',
      accelerator: 'CmdOrCtrl+O',
      click: (item, focusedWindow) => {
        appWindow.openDialog()
      }
    },
    separatorMenuItem,
    {
      label: 'Save As...',
      accelerator: 'Shift+CmdOrCtrl+S',
      click: (item, focusedWindow) => {
        appWindow.saveAsDialog()
      }
    }
  ]
  const debugSubmenu = [
    { role: 'toggledevtools' }
  ]
  const helpSubmenu = [
    {
      label: 'Quick Start Guide',
      click: (item, focusedWindow) => {
        quickStart.showQuickStart()
      }
    },
    {
      label: 'Send Feedback / Bug Reports',
      click: (item, focusedWindow) => {
        electron.shell.openExternal('mailto:tad-feedback@tadviewer.com')
      }
    }
  ]
  const template = [
    { label: 'File', submenu: fileSubmenu }
  ]
  if (process.env.NODE_ENV === 'development') {
    template.push({
      label: 'Debug',
      submenu: debugSubmenu
    })
  }
  template.push({
    label: 'Help',
    submenu: helpSubmenu
  })
  if (isDarwin) {
    template.unshift({
      label: 'Tad', // ignored on Mac OS; comes from plist
      submenu: [
        aboutTadMenuItem(),
        separatorMenuItem,
        checkForUpdateMenuItem(),
        separatorMenuItem,
        { role: 'quit' }
      ]
    })
  }

  let oldMenu = appMenu
  appMenu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(appMenu)
  if (oldMenu) {
    oldMenu.destroy()
  }
}
