/*
 * main module for render process
 */
import "source-map-support/register";
import * as React from "react";
import * as ReactDOM from "react-dom";
import OneRef, { mkRef, refContainer, mutableGet, StateRef } from "oneref";
import { AppPane, AppPaneBaseProps } from "tadviewer";
import { PivotRequester } from "tadviewer";
import { AppState } from "tadviewer";
import { ViewParams, actions } from "tadviewer";
import { initAppState } from "tadviewer";
import * as reltab from "reltab";
import log from "loglevel";
import { ElectronTransportClient } from "./electronClient";
import * as electron from "electron";
import { clipboard, ipcRenderer, shell } from "electron";
import { DataSourcePath, DataSourceId, RemoteReltabConnection } from "reltab";
import { OpenParams } from "./openParams";
import "./app.css";

const initMainProcess = () => ipcRenderer.invoke("initMain");
const remoteErrorDialog = (title: string, msg: string, fatal = false) => {
  return ipcRenderer.invoke("errorDialog", title, msg, fatal);
};
const newWindowFromDSPath = (
  dsPath: DataSourcePath,
  stateRef: StateRef<AppState>
) => ipcRenderer.invoke("newWindowFromDSPath", dsPath);

type InitInfo = {
  connKey: DataSourceId;
};

let delay = (ms: number) => {
  if (ms > 0) {
    log.log("injecting delay of ", ms, " ms");
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
};

function openParamsDSPath(
  openParams: OpenParams
): [DataSourcePath | null, ViewParams | null] {
  let targetDSPath: DataSourcePath | null;
  let viewParams: ViewParams | null = null;
  switch (openParams.openType) {
    case "fspath":
      const connKey: DataSourceId = {
        providerName: "localfs",
        resourceId: openParams.path,
      };
      targetDSPath = { sourceId: connKey, path: ["."] };
      break;
    case "dspath":
      targetDSPath = openParams.dsPath;
      break;
    case "tad":
      const parsedFileState = JSON.parse(openParams.fileContents!);
      const savedFileState = parsedFileState.contents;
      // attempt to migrate from version 1 format:
      if (parsedFileState.tadFileFormatVersion === 1) {
        const rawTargetPath = savedFileState.targetPath;
        log.info("Found older tad file format, targetPath: ", rawTargetPath);
        const connKey: DataSourceId = {
          providerName: "localfs",
          resourceId: rawTargetPath,
        };
        targetDSPath = { sourceId: connKey, path: ["."] };
      } else {
        targetDSPath = savedFileState.dsPath;
      }
      viewParams = ViewParams.deserialize(savedFileState.viewParams);
      break;
    case "empty":
      targetDSPath = null;
  }
  return [targetDSPath, viewParams];
}

async function openFromOpenParams(
  openParams: OpenParams | undefined,
  stateRef: StateRef<AppState>
) {
  let targetDSPath: DataSourcePath | null = null;
  let viewParams: ViewParams | null = null;

  if (openParams) {
    [targetDSPath, viewParams] = openParamsDSPath(openParams);
    if (targetDSPath !== null) {
      await actions.openDataSourcePath(
        targetDSPath,
        stateRef,
        viewParams ?? undefined
      );
    }
  }
}
// TODO: figure out how to initialize based on saved views or different file / table names
const init = async () => {
  const tStart = performance.now();
  log.setLevel(log.levels.DEBUG);
  const appState = new AppState();
  const stateRef = mkRef(appState);
  const [App, listenerId] = refContainer<AppState, AppPaneBaseProps>(
    stateRef,
    AppPane
  );

  try {
    await initMainProcess();
    const tconn = new ElectronTransportClient();

    const rtc = new RemoteReltabConnection(tconn);

    var pivotRequester: PivotRequester | undefined | null = null;

    await initAppState(rtc, stateRef);

    const openURL = (url: string) => {
      shell.openExternal(url);
    };

    ReactDOM.render(
      <App
        newWindow={newWindowFromDSPath}
        clipboard={clipboard}
        openURL={openURL}
      />,
      document.getElementById("app")
    );
    const tRender = performance.now();
    log.debug("Time to initial render: ", (tRender - tStart) / 1000, " sec");
    pivotRequester = new PivotRequester(stateRef);

    const openParams = (window as any).openParams as OpenParams | undefined;
    await openFromOpenParams(openParams, stateRef);

    ipcRenderer.on("request-serialize-app-state", (event, req) => {
      const { requestId } = req;
      const curState = mutableGet(stateRef);
      const viewState = curState.viewState;
      const { dsPath } = viewState;
      const viewParamsJS = (viewState.viewParams as any).toJS(); // weird typing issue with immmutable
      const serState = {
        dsPath,
        viewParams: viewParamsJS,
      };
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
      const baseQuery = curState.viewState.baseQuery;
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
    ipcRenderer.on("open-file", (event, req) => {
      const { openParams } = req;
      openFromOpenParams(openParams, stateRef);
    });

    document.addEventListener("copy", function (e) {
      console.log("**** renderMain: got copy event");
    });

    ipcRenderer.send("render-init-complete");
  } catch (e) {
    const err = e as any;
    console.error(
      "renderMain: caught error during initialization: ",
      err.message,
      err.stack
    );
    remoteErrorDialog("Error initializing Tad", err.message, true);
  }
};
init();
