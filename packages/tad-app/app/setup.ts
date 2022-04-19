/**
 *
 * electron-builer doesn't seem to provide a bespoke post-install step, so
 * we'll do this at application startup time by checking for a version-specific
 * marker file in the filesystem.
 *
 */
import path from "path";
import fs from "fs";
import log from "electron-log";
import electron from "electron";
import { URL } from "url";
const app = electron.app;
const isDarwin = process.platform === "darwin";
const MARKER_BASENAME = "install-marker-";

/**
 * @returns true iff we're running the packaged version of the app
 */
export const runningPackaged = (): boolean => {
  const appPath = app.getAppPath();
  const appBase = path.basename(appPath);

  return appBase === "app.asar";
};

const postInstall = (markerPath: string | number | Buffer | URL) => {
  const appPath = app.getAppPath();
  const appBase = path.basename(appPath);

  if (appBase !== "app.asar") {
    // We can only create the symbolic link to the packaged app
    log.info(
      "postInsall: not running from packaged app, skipping post-install"
    );
    return;
  } // and create the marker:

  fs.writeFileSync(markerPath, "");
};
/*
 * check for marker file and run post install step if it doesn't exist
 *
 * returns: true iff first install detected
 */

export const postInstallCheck = () => {
  let firstInstall = false;
  const userDataPath = app.getPath("userData");
  const versionStr = app.getVersion().replace(/\./g, "_");
  const markerFilename = MARKER_BASENAME + versionStr + ".txt";
  const markerPath = path.join(userDataPath, markerFilename);
  log.debug("postInstallCheck: looking for install marker file ", markerPath);

  if (fs.existsSync(markerPath)) {
    log.debug(
      "postInstalCheck: found marker file, skipping post-install setup"
    );
  } else {
    log.warn(
      "postInstallCheck: install marker file not found, performing post-install step."
    );
    firstInstall = true;

    try {
      postInstall(markerPath);
      log.warn("postInstallCheck: postInstall complete");
    } catch (e) {
      log.error("postInstallCheck: ", (e as any).message);
      log.error((e as any).stack);
    }
  }

  return firstInstall;
};
