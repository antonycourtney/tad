/**
 *
 * electron-builer doesn't seem to provide a bespoke post-install step, so
 * we'll do this at application startup time by checking for a version-specific
 * marker file in the filesystem.
 *
 */
const path = require('path')
const fs = require('fs')
const log = require('electron-log')
const electron = require('electron')
const app = electron.app

const isDarwin = process.platform === 'darwin'
const MARKER_BASENAME = 'install-marker-'

const postInstall = (markerPath) => {
  const appPath = app.getAppPath()
  const appBase = path.basename(appPath)
  if (appBase !== 'app.asar') {
    // We can only create the symbolic link to the packaged app
    log.info('postInsall: not running from packaged app, skipping post-install')
    return
  }
  const appDir = path.dirname(appPath)
  const targetPath = path.join(appDir, 'tad.sh')

  if (isDarwin) {
    const linkPath = '/usr/local/bin/tad'
    if (fs.existsSync(linkPath)) {
      log.warn('file ' + linkPath + ' exists -- skipping symlink creation.')
    } else {
      fs.symlinkSync(targetPath, linkPath)
      log.warn('created symlink ' + linkPath + ' -> ' + targetPath)
    }
  }
  // and create the marker:
  fs.writeFileSync(markerPath, '')
}

/*
 * check for marker file and run post install step if it doesn't exist
 *
 * returns: true iff first install detected
 */
export const postInstallCheck = () => {
  let firstInstall = false
  const userDataPath = app.getPath('userData')
  const versionStr = app.getVersion().replace(/\./g, '_')
  const markerFilename = MARKER_BASENAME + versionStr + '.txt'
  const markerPath = path.join(userDataPath, markerFilename)
  log.info('postInstallCheck: looking for install marker file ', markerPath)
  if (fs.existsSync(markerPath)) {
    log.info('postInstalCheck: found marker file, skipping post-install setup')
  } else {
    log.warn('postInstallCheck: install marker file not found, performing post-install step.')
    firstInstall = true
    try {
      postInstall(markerPath)
      log.warn('postInstallCheck: postInstall complete')
    } catch (e) {
      log.error('postInstallCheck: ', e.message)
      log.error(e.stack)
    }
  }
  return firstInstall
}
