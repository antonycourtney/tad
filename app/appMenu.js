
import * as updater from './updater'

const electron = require('electron')
const dialog = electron.dialog
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const Menu = electron.Menu

const isDarwin = process.platform === 'darwin'

let appMenu = null

const separatorMenuItem = { type: 'separator' }

const aboutTadMenuItem = () => {
  return {
    label: 'About Tad',
    role: 'about'
/* ,
    click: (item, focusedWindow) => {}
*/
  }
}
const checkForUpdateMenuItem = () => {
  return {
    label: 'Check for Updates',
    click: updater.checkForUpdates
  }
}
export const createMenu = () => {
  const template = [
  ]
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
