/**
 * A Tad Viewer pane for embedding a tad view of a SQL query on a data source
 */
import log from "loglevel";
import { mkRef, refContainer, StateRef } from "oneref";
import * as React from "react";
import { useMemo, useState } from "react";
import {
  DataSourceConnection,
  DataSourcePath,
  LocalReltabConnection,
} from "reltab";
import { initAppState } from "../actions";
import { AppState } from "../AppState";
import { PivotRequester } from "../PivotRequester";
import { actions } from "../tadviewer";
import { AppPaneBaseProps, AppPane, tadReact } from "./AppPane";

interface TadViewerPaneInnerProps {
  stateRef: StateRef<AppState>;
  baseQuery: string;
}

const newWindowFromDSPath = (
  dsPath: DataSourcePath,
  _stateRef: StateRef<AppState>
) => {
  // TODO! Generate a URL based on dsPath and call window.open(url, "_blank")
  console.log("TODO: newWindowFromDSPath: ", dsPath);
};

function TadViewerPaneInner({ stateRef, baseQuery }: TadViewerPaneInnerProps) {
  const [AppComponent, _listenerId] = refContainer<AppState, AppPaneBaseProps>(
    stateRef,
    AppPane
  );

  const openURL = (url: string) => {
    window.open(url, "_blank");
  };

  return (
    <AppComponent
      newWindow={newWindowFromDSPath}
      clipboard={navigator.clipboard}
      openURL={openURL}
      showDataSources={false}
      embedded={true}
    />
  );
}

export interface TadViewerPaneProps {
  baseSqlQuery: string;
  dsConn: DataSourceConnection;
  errorCallback?: (e: Error) => void;
  setLoadingCallback: (loading: boolean) => void;
}

export function TadViewerPane({
  baseSqlQuery,
  dsConn,
  errorCallback,
  setLoadingCallback,
}: TadViewerPaneProps): JSX.Element | null {
  const [appStateRef, setAppStateRef] = useState<StateRef<AppState> | null>(
    null
  );
  const [pivotRequester, setPivotRequester] = useState<PivotRequester | null>(
    null
  );

  const openURL = (url: string) => {
    window.open(url, "_blank");
  };

  React.useEffect(() => {
    async function initTadAppState() {
      // log.setLevel("debug");
      log.debug("*** initTadAppState()");
      const rtc = LocalReltabConnection.getInstance();
      log.debug("*** TadViewerPane: got local reltab connection: ", rtc);

      if (!appStateRef) {
        const appState = new AppState();
        const stateRef = mkRef(appState);
        setAppStateRef(stateRef);
        log.debug("*** initializing app state:");
        await initAppState(rtc, stateRef);
        log.debug("*** initialized Tad App state");
        const preq = new PivotRequester(stateRef, errorCallback, setLoadingCallback);
        log.debug("*** created pivotRequester");
        setPivotRequester(preq);
        log.debug("*** App component created and pivotrequester initialized");
      }
    }
    initTadAppState();
  }, []);

  /* update the view when the query changes */
  React.useEffect(() => {
    console.log("*** TadViewerPane: query update, updating view...");
    if (appStateRef != null && pivotRequester != null) {
      actions.setQueryView(appStateRef, dsConn, baseSqlQuery);
      log.debug("**** set app view to base query");
    }
  }, [baseSqlQuery, pivotRequester, appStateRef]);

  let tadAppElem: JSX.Element | null = null;
  if (pivotRequester && appStateRef) {
    tadAppElem = (
      <TadViewerPaneInner baseQuery={baseSqlQuery} stateRef={appStateRef} />
    );
  }
  return tadAppElem;
}
