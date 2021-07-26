import url from "url";

import path from "path";

import log from "electron-log";

import electron, { BrowserWindow } from "electron";

const app = electron.app;
let win: BrowserWindow | null = null;

const createSetupInfo = () => {
  const platform = process.platform;
  const appPath = app.getAppPath();
  const appDir = path.dirname(appPath);
  const appScriptPath = path.join(appDir, "tad.sh");
  const exePath = app.getPath("exe");
  const exeDir = path.dirname(exePath);
  (global as any).setupInfo = {
    platform,
    appDir,
    appScriptPath,
    exePath,
    exeDir,
  };
};

export const showQuickStart = () => {
  if (!win) {
    createSetupInfo();
    win = new BrowserWindow({
      width: 850,
      height: 600,
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
