import url from "url";

import path from "path";

import log from "electron-log";

import electron, { BrowserWindow, ipcMain } from "electron";
import * as appWindow from "./appWindow";

const app = electron.app;
let win: BrowserWindow | null = null;

function getSetupInfo(): any {
  const platform = process.platform;
  const appPath = app.getAppPath();
  const appDir = path.dirname(appPath);
  const appScriptPath = path.join(appDir, "tad.sh");
  const exePath = app.getPath("exe");
  const exeDir = path.dirname(exePath);
  const setupInfo = {
    platform,
    appDir,
    appScriptPath,
    exePath,
    exeDir,
  };
  return setupInfo;
}

function openExample() {
  const app = electron.app;
  const appPath = app.getAppPath();
  const appDir = process.defaultApp ? appPath : path.dirname(appPath);
  const exampleFilePath = path.join(appDir, "examples", "movie_metadata.csv");
  appWindow.createFromFile(exampleFilePath);
}

export const showQuickStart = () => {
  if (!win) {
    ipcMain.handle("getSetupInfo", getSetupInfo);
    ipcMain.handle("openExample", openExample);
    win = new BrowserWindow({
      width: 850,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });
    win.loadURL(
      url.format({
        pathname: path.join(__dirname, "userdocs", "quickstart.html"),
        protocol: "file:",
        slashes: true,
      })
    );
    win.on("close", (e) => {
      win = null;
    });
  }

  win.show();
};
