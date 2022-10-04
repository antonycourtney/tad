/**
 * A Tad Viewer pane for embedding a tad view of a SQL query on a data source
 */
import { mkRef, refContainer, StateRef } from "oneref";
import * as React from "react";
import { useState } from "react";
import {
  DataSourceConnection,
  DataSourcePath,
  LocalReltabConnection,
} from "reltab";
import { initAppState } from "../actions";
import { AppState } from "../AppState";
import { PivotRequester } from "../PivotRequester";
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

  console.log("*** in TadViewerPaneInner");
  return (
    <AppComponent
      newWindow={newWindowFromDSPath}
      clipboard={navigator.clipboard}
      openURL={openURL}
    />
  );
}

export interface TadViewerPaneProps {
  baseSqlQuery: string;
  dsConn: DataSourceConnection;
}

export function TadViewerPane({
  baseSqlQuery,
  dsConn,
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
      console.log("*** initTadAppState()");
      const rtc = LocalReltabConnection.getInstance();
      console.log("*** TadViewerPane: got local reltab connection: ", rtc);

      const appState = new AppState();
      const stateRef = mkRef(appState);
      setAppStateRef(stateRef);
      console.log("*** initializing app state:");
      await initAppState(rtc, stateRef);
      console.log("*** initialized Tad App state");
      const preq = new PivotRequester(stateRef);
      console.log("*** created pivotRequester");
      setPivotRequester(preq);
      console.log("*** App component created and pivotrequester initialized");
    }
    initTadAppState();
  }, []);

  let tadAppElem: JSX.Element | null = null;
  if (pivotRequester && appStateRef) {
    tadAppElem = (
      <TadViewerPaneInner baseQuery={baseSqlQuery} stateRef={appStateRef} />
    );
  }
  return tadAppElem;
}
