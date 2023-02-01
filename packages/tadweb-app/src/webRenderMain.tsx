/*
 * main module for render process
 */
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useSearchParams,
} from "react-router-dom";
import OneRef, { mkRef, mutableGet, refContainer, StateRef } from "oneref";
import {
  AppState,
  AppPane,
  AppPaneBaseProps,
  PivotRequester,
  tadReact,
  AppPaneProps,
  actions,
} from "tadviewer";
import { ViewParams } from "tadviewer";
import { initAppState } from "tadviewer";
import * as reltab from "reltab";
import log from "loglevel";
import { WebTransportClient } from "./reltabWebClient";
import { DataSourceId, DataSourcePath, RemoteReltabConnection } from "reltab";
import _ from "lodash";
import { useState } from "react";

const testBaseUrl = "http://localhost:9000";
// const TEST_FILE = "movie_metadata.csv";

// const TEST_TABLE = "bigquery-public-data.covid19_jhu_csse.summary";
// const TEST_TABLE = "bigquery-public-data.github_repos.commits";
// const TEST_TABLE = "bigquery-public-data.iowa_liquor_sales.sales";
const TEST_TABLE = "movie_metadata";

/*
const openParams = {
  openType: "csv",
  targetPath: testTable + ".csv",
  fileContents: null,
  srcFile: null,
};
*/

const newWindowFromDSPath = (
  dsPath: DataSourcePath,
  stateRef: StateRef<AppState>
) => {
  // TODO! Generate a URL based on dsPath and call window.open(url, "_blank")
  console.log("TODO: newWindowFromDSPath: ", dsPath);
};

function NoMatch() {
  return (
    <div>
      <h2>Nothing to see here!</h2>
      <p>
        <Link to="/">Go to the home page</Link>
      </p>
    </div>
  );
}

const loadSnowflakeTable = async (
  stateRef: OneRef.StateRef<AppState>,
  rtc: reltab.ReltabConnection,
  tablePath: string[]
) => {
  const rootSources = await rtc.getDataSources();
  const snowflakeDS = rootSources.find(
    (src) => src.providerName === "snowflake"
  );
  if (snowflakeDS) {
    const dsPath: DataSourcePath = { sourceId: snowflakeDS, path: tablePath };
    const appState = mutableGet(stateRef);
    const { viewState } = appState;

    if (viewState === null) {
      actions.openDataSourcePath(dsPath, stateRef);
    }
  }
};

const WebAppPane = (props: AppPaneProps): JSX.Element => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loadingTable, setLoadingTable] = useState<string | null>(null);
  React.useEffect(() => {
    const tableName = searchParams.get("table");
    if (tableName && tableName.length > 0) {
      const tablePath = tableName.split(".");
      if (tablePath.length === 3) {
        if (loadingTable !== tableName) {
          setLoadingTable(tableName);
          tablePath.unshift(".");
          loadSnowflakeTable(props.stateRef, props.appState.rtc, tablePath);
        }
      }
    }
  });
  return <AppPane {...props} />;
};

// TODO: figure out how to initialize based on saved views or different file / table names
const init = async () => {
  console.log("hello, Tad!");
  log.setLevel(log.levels.DEBUG);
  let targetPath: string = "";
  let srcFile = null;
  let viewParams: ViewParams | null = null;

  const appState = new AppState();
  const stateRef = mkRef(appState);
  const [App, listenerId] = refContainer<AppState, AppPaneBaseProps>(
    stateRef,
    WebAppPane
  );

  // const tableName = TEST_TABLE;
  // const rtc = new WebReltabConnection(testBaseUrl);

  // const tableName = await rtc.importFile(TEST_FILE);

  const wtc = new WebTransportClient(testBaseUrl);

  const rtc = new RemoteReltabConnection(wtc);

  var pivotRequester: PivotRequester | undefined | null = null;

  await initAppState(rtc, stateRef);

  const openURL = (url: string) => {
    window.open(url, "_blank");
  };

  console.log("*** react module consistency check: ", React === tadReact);
  console.log("React: ", React);
  console.log("tadReact: ", tadReact);

  ReactDOM.createRoot(document.getElementById("app")!).render(
    <BrowserRouter>
      <Routes>
        <Route
          path="*"
          element={
            <App
              newWindow={newWindowFromDSPath}
              clipboard={navigator.clipboard}
              openURL={openURL}
              embedded={false}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
  pivotRequester = new PivotRequester(stateRef);
};
init();
