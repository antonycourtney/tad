/**
 * updater.js
 *
 * Based on code snippet from electron-builder docs found here:
 * https://github.com/electron-userland/electron-builder/blob/master/docs/encapsulated%20manual%20update%20via%20menu.js
 */
const { dialog } = require('electron')
const { autoUpdater } = require('electron-updater')

let updater
autoUpdater.autoDownload = false

autoUpdater.on('error', (event, error) => {
  dialog.showErrorBox('Error: ', error == null ? 'unknown' : (error.stack || error).toString())
})

autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Found Updates',
    message: 'A new release of Tad is available. Do you want to update now?',
    buttons: ['Yes', 'No']
  }, (buttonIndex) => {
    if (buttonIndex === 0) {
      autoUpdater.downloadUpdate()
    } else {
      updater.enabled = true
      updater = null
    }
  })
})

autoUpdater.on('update-not-available', () => {
  dialog.showMessageBox({
    title: 'No Updates',
    message: 'Current version is up-to-date.'
  })
  updater.enabled = true
  updater = null
})

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    title: 'Install Updates',
    message: 'Update downloaded, will  update...'
  }, () => {
    autoUpdater.quitAndInstall()
  })
})

// export this to MenuItem click callback
function checkForUpdates (menuItem, focusedWindow, event) {
  console.log('updater.checkForUpdates')
  updater = menuItem
  updater.enabled = false
  autoUpdater.checkForUpdates()
}
module.exports.checkForUpdates = checkForUpdates
