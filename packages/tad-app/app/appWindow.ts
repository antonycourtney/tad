import url from "url";

import path from "path";

import electron, { BrowserWindow, IpcMainEvent } from "electron";

const dialog = electron.dialog;
const ipcMain = electron.ipcMain;

import fs from "fs";
import log from "electron-log";
import * as csvexport from "./csvexport";
import reltab from "reltab";

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.

let mainWindows: BrowserWindow[] = [];
let openCount = 0;
let baseX = 0;
let baseY = 0;
const POS_OFFSET = 25; // pixel offset of new windows
// encode open parameters to pass to render process
// If we're opening a CSV file, we just pass the target path.
// If we're opening a Tad workspace, we read its contents

const encodeOpenParams = (targetPath: string): object => {
  let openParams;

  if (path.extname(targetPath) === ".tad") {
    const fileContents = fs.readFileSync(targetPath, "utf8");
    openParams = {
      fileType: "tad",
      srcFile: targetPath,
      fileContents,
    };
  } else {
    openParams = {
      fileType: "csv",
      targetPath,
    };
  }

  return openParams;
};

export const create = (targetPath: string) => {
  const pathBasename = path.basename(targetPath);
  const title = "Tad - " + pathBasename;
  let winProps = {
    width: 1280,
    height: 980,
    title,
    x: 0,
    y: 0,
    webPreferences: {
      nodeIntegration: true,
    },
  };

  if (openCount > 0) {
    winProps.x = baseX + openCount * POS_OFFSET;
    winProps.y = baseY + openCount * POS_OFFSET;
  }

  const win = new BrowserWindow(winProps);

  if (openCount === 0) {
    // first window:
    const bounds = win.getBounds();
    baseX = bounds.x;
    baseY = bounds.y;
  } // win.targetPath = targetPath

  (win as any).openParams = encodeOpenParams(targetPath);
  win.loadURL(
    url.format({
      pathname: path.join(__dirname, "index.html"),
      protocol: "file:",
      slashes: true,
    })
  ); // Open the DevTools.

  win.webContents.openDevTools({
    mode: "bottom",
  });
  win.webContents.closeDevTools(); // Emitted when the window is closed.

  win.on("closed", function () {
    const idx = mainWindows.indexOf(win);

    if (idx) {
      delete mainWindows[idx];
    }
  });
  mainWindows.push(win);
  openCount += 1;
  return win;
};
export const openDialog = () => {
  const openPaths = dialog.showOpenDialogSync({
    properties: ["openFile"],
    filters: [
      {
        name: "CSV files",
        extensions: ["csv"],
      },
      {
        name: "TSV files",
        extensions: ["tsv"],
      },
      {
        name: "Tad Workspace files",
        extensions: ["tad"],
      },
    ],
  });

  if (openPaths && openPaths.length > 0) {
    const filePath = openPaths[0];
    create(filePath);
  }
};
let stateRequestId = 100;
let pendingStateRequests: { [key: number]: any } = {}; // handle a response from renderer process by looking up Promise resolver:

const handleResponse = (event: IpcMainEvent, response: any) => {
  const resolve = pendingStateRequests[response.requestId];
  resolve(response.contents); // and clear out entry:

  delete pendingStateRequests[response.requestId];
}; // deal with responses from render process for app state request:

ipcMain.on("response-serialize-app-state", handleResponse);
ipcMain.on("response-serialize-filter-query", handleResponse); // async function to retrieve app state from renderer process:

export const getAppState = async (win: BrowserWindow) => {
  return new Promise((resolve, reject) => {
    const requestId = stateRequestId++;
    pendingStateRequests[requestId] = resolve;
    const requestContents = {
      windowId: win.id,
      requestId,
    };
    win.webContents.send("request-serialize-app-state", requestContents);
  });
}; // async function to retrieve filter query from renderer process:

export const getFilterQuery = async (win: BrowserWindow): Promise<string> => {
  return new Promise((resolve, reject) => {
    const requestId = stateRequestId++;
    pendingStateRequests[requestId] = resolve;
    const requestContents = {
      windowId: win.id,
      requestId,
    };
    win.webContents.send("request-serialize-filter-query", requestContents);
  });
};
const TAD_FILE_FORMAT_VERSION = 2;

const serialize = (contents: any): string => {
  const versionedObject = {
    tadFileFormatVersion: TAD_FILE_FORMAT_VERSION,
    contents,
  };
  return JSON.stringify(versionedObject, null, 2);
};

export const saveAsDialog = async () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) {
    return;
  }
  const fileContents = await getAppState(win);
  const saveFilename = dialog.showSaveDialogSync(win, {
    title: "Save Tad Workspace",
    filters: [
      {
        name: "Tad Workspace files",
        extensions: ["tad"],
      },
    ],
  });

  if (!saveFilename) {
    // user cancelled save as...
    return;
  }

  const saveStr = serialize(fileContents);
  fs.writeFile(saveFilename, saveStr, (err) => {
    if (err) {
      dialog.showErrorBox("Error saving file: ", err.toString());
    }

    log.info("succesfully saved workspace to ", saveFilename);
  });
};
export const exportFiltered = async (win: BrowserWindow) => {
  console.log("exportFiltered");
  const queryStr: string = await getFilterQuery(win);
  const req = reltab.deserializeQueryReq(queryStr);
  const { query, filterRowCount } = req;
  let saveFilename = null;
  saveFilename = dialog.showSaveDialogSync(win, {
    title: "Export Filtered CSV",
    filters: [
      {
        name: "CSV Files",
        extensions: ["csv"],
      },
    ],
  });

  if (!saveFilename) {
    // user cancelled save as...
    return;
  }

  await csvexport.exportAs(win, saveFilename, filterRowCount, query);
};
