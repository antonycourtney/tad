/*
 * main module for render process
 */
// eslint-disable-line

import * as React from "react";
import * as ReactDOM from "react-dom";
import OneRef, { mkRef, refContainer } from "oneref";
import { AppPane, AppPaneBaseProps } from "./components/AppPane";
import { PivotRequester } from "./PivotRequester";
import { AppState } from "./AppState";
import { ViewParams } from "./ViewParams";
import * as reltab from "reltab";
import log from "loglevel";
// import * as reltabElectron from "./reltab-electron";
import * as actions from "./actions";
import { ReltabWebConnection } from "./reltabWebClient";
const testBaseUrl = "http://localhost:9000";
const testTable = "movie_metadata";

// was: import * as styles from "../less/app.less";

require("./slickgrid.scss");
require("../less/app.less");

require("../less/sidebar.less");

require("../less/columnSelector.less");

require("../less/columnList.less");

require("../less/singleColumnSelect.less");

require("../less/modal.less");

require("../less/footer.less");

require("../less/filterEditor.less"); // require('babel-polyfill')

// const remote = require("electron").remote;
// const remoteInitMain = remote.getGlobal("initMain");
// const remoteErrorDialog = remote.getGlobal("errorDialog");

// const ipcRenderer = require("electron").ipcRenderer;

const openParams = {
  fileType: "csv",
  targetPath: "movie_metadata.csv",
  fileContents: null,
  srcFile: null,
};

const init = async () => {
  log.setLevel(log.levels.DEBUG);
  let targetPath: string = "";
  let srcFile = null;
  let viewParams: ViewParams | null = null;

  if (openParams.fileType === "csv") {
    targetPath = openParams.targetPath;
  } else if (openParams.fileType === "tad") {
    const parsedFileState = JSON.parse(openParams.fileContents!); // This would be the right place to validate / migrate tadFileFormatVersion

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

  ReactDOM.render(<App />, document.getElementById("app"));

  const rtc = new ReltabWebConnection(testBaseUrl);

  const ti = await rtc.getTableInfo(testTable);
  const tableName = ti.tableName;
  const baseQuery = reltab.tableQuery(tableName);
  // const rtc = reltabElectron.init(); // module local to keep alive:

  var pivotRequester: PivotRequester | undefined | null = null;

  await actions.initAppState(
    rtc,
    ti.tableName,
    baseQuery,
    viewParams,
    stateRef
  );
  pivotRequester = new PivotRequester(stateRef);

  /*
          ipcRenderer.on("request-serialize-app-state", (event, req) => {
            console.log("got request-serialize-app-state: ", req);
            const { requestId } = req;
            const curState = stateRef.getValue();
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
            actions.setShowHiddenCols(val, updater);
          });
          ipcRenderer.on("request-serialize-filter-query", (event, req) => {
            console.log("got request-serialize-filter-query: ", req);
            const { requestId } = req;
            const curState = stateRef.getValue();
            const baseQuery = curState.baseQuery;
            const viewParams = curState.viewState.viewParams;
            const filterRowCount = curState.viewState.queryView.filterRowCount;
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
            actions.setExportDialogOpen(openState, saveFilename, updater);
          });
          ipcRenderer.on("export-progress", (event, req) => {
            const { percentComplete } = req;
            actions.setExportProgress(percentComplete, updater);
          });
        });
    })
    .catch((err) => {
      console.error(
        "renderMain: caught error during initialization: ",
        err.message,
        err.stack
      );
      remoteErrorDialog("Error initializing Tad", err.message, true);
    });
  */
};

init();
