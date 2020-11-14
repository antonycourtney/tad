/*
 * main module for render process
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import OneRef, { mkRef, refContainer, mutableGet } from "oneref";
import { AppPane, AppPaneBaseProps } from "tadviewer";
import { PivotRequester } from "tadviewer";
import { AppState } from "tadviewer";
import { ViewParams, actions } from "tadviewer";
import { initAppState } from "tadviewer";
import * as reltab from "reltab";
import log from "loglevel";
import { ElectronTransportClient } from "./electronClient";
import * as electron from "electron";
import { DbConnectionKey, RemoteReltabConnection, TableInfo } from "reltab";

const remote = electron.remote;
const remoteInitMain = remote.getGlobal("initMain");
const remoteErrorDialog = remote.getGlobal("errorDialog");

const ipcRenderer = electron.ipcRenderer;

type InitInfo = {
  tableInfo: TableInfo;
  connKey: DbConnectionKey;
};

const initMainProcess = (
  targetPath: string,
  srcFile: string
): Promise<InitInfo> => {
  return new Promise((resolve, reject) => {
    remoteInitMain(targetPath, srcFile, (err: any, initStr: string) => {
      if (err) {
        console.error("initMain error: ", err);
        reject(err);
      } else {
        const initInfo: InitInfo = JSON.parse(initStr);
        resolve(initInfo);
      }
    });
  });
};

// TODO: figure out how to initialize based on saved views or different file / table names
const init = async () => {
  log.setLevel(log.levels.DEBUG);
  // console.log("testing, testing, one two...");
  log.debug("Hello, Electron!");
  const openParams: any = (remote.getCurrentWindow() as any).openParams;
  let targetPath: string = "";
  let srcFile: string | null = null;
  let viewParams: ViewParams | null = null;
  if (openParams.fileType === "csv") {
    targetPath = openParams.targetPath;
  } else if (openParams.fileType === "tad") {
    const parsedFileState = JSON.parse(openParams.fileContents);
    // This would be the right place to validate / migrate tadFileFormatVersion
    const savedFileState = parsedFileState.contents;
    targetPath = savedFileState.targetPath;
    srcFile = openParams.srcFile;
    viewParams = ViewParams.deserialize(savedFileState.viewParams);
  }

  const appState = new AppState({
    targetPath,
  });
  const stateRef = mkRef(appState);
  const [App, listenerId] = refContainer<AppState, AppPaneBaseProps>(
    stateRef,
    AppPane
  );

  try {
    const initInfo = await initMainProcess(targetPath, srcFile!);
    const ti = initInfo.tableInfo;
    const rtEngine = initInfo.connKey;

    const tconn = new ElectronTransportClient();

    const rtc = new RemoteReltabConnection(tconn);

    const dbc = await rtc.connect(
      initInfo.connKey,
      initInfo.tableInfo.tableName
    );

    const baseQuery = reltab.tableQuery(ti.tableName);

    var pivotRequester: PivotRequester | undefined | null = null;

    await initAppState(rtc, dbc, ti.tableName, baseQuery, viewParams, stateRef);

    ReactDOM.render(<App />, document.getElementById("app"));
    pivotRequester = new PivotRequester(stateRef);

    ipcRenderer.on("request-serialize-app-state", (event, req) => {
      console.log("got request-serialize-app-state: ", req);
      const { requestId } = req;
      const curState = mutableGet(stateRef);
      const viewParamsJS = curState.viewState.viewParams.toJS();
      const serState = {
        targetPath,
        viewParams: viewParamsJS,
      };
      console.log("current viewParams: ", viewParamsJS);
      ipcRenderer.send("response-serialize-app-state", {
        requestId,
        contents: serState,
      });
    });
    ipcRenderer.on("set-show-hidden-cols", (event, val) => {
      actions.setShowHiddenCols(val, stateRef);
    });
    ipcRenderer.on("request-serialize-filter-query", (event, req) => {
      console.log("got request-serialize-filter-query: ", req);
      const { requestId } = req;
      const curState = mutableGet(stateRef);
      const baseQuery = curState.baseQuery;
      const viewParams = curState.viewState.viewParams;
      const filterRowCount = curState.viewState.queryView!.filterRowCount;
      const queryObj = {
        query: baseQuery.filter(viewParams.filterExp),
        filterRowCount,
      };
      const contents = JSON.stringify(queryObj, null, 2);
      ipcRenderer.send("response-serialize-filter-query", {
        requestId,
        contents,
      });
    });
    ipcRenderer.on("open-export-dialog", (event, req) => {
      const { openState, saveFilename } = req;
      actions.setExportDialogOpen(openState, saveFilename, stateRef);
    });
    ipcRenderer.on("export-progress", (event, req) => {
      const { percentComplete } = req;
      actions.setExportProgress(percentComplete, stateRef);
    });
  } catch (err) {
    console.error(
      "renderMain: caught error during initialization: ",
      err.message,
      err.stack
    );
    // remoteErrorDialog("Error initializing Tad", err.message, true);
  }
};
console.log("before init");
init();
