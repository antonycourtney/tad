/**
 * A Tad Viewer pane for embedding a tad view of a SQL query on a data source
 */
import { mkRef, mutableGet, refContainer, StateRef } from "oneref";
import * as React from "react";
import { useRef, useState } from "react";
import {
  DataSourceConnection,
  DataSourcePath,
  FilterExp,
  LocalReltabConnection,
  QueryExp,
} from "reltab";
import { initAppState } from "../actions";
import { AppState } from "../AppState";
import { PivotRequester } from "../PivotRequester";
import { actions } from "../tadviewer";
import { AppPaneBaseProps, AppPane, tadReact } from "./AppPane";

interface TadViewerPaneInnerProps {
  stateRef: StateRef<AppState>;
  baseQuery: string;
  rightFooterSlot?: JSX.Element;
  onFilter?: (filterExp: FilterExp) => void;
}

const newWindowFromDSPath = (
  dsPath: DataSourcePath,
  _stateRef: StateRef<AppState>
) => {
  // TODO! Generate a URL based on dsPath and call window.open(url, "_blank")
  console.log("TODO: newWindowFromDSPath: ", dsPath);
};

function TadViewerPaneInner({
  stateRef,
  baseQuery,
  rightFooterSlot = undefined,
  onFilter = undefined,
}: TadViewerPaneInnerProps) {
  const viewerPane = useRef<JSX.Element | null>(null);

  const openURL = (url: string) => {
    window.open(url, "_blank");
  };

  if (viewerPane.current == null) {
    const [AppComponent, _listenerId] = refContainer<
      AppState,
      AppPaneBaseProps
    >(stateRef, AppPane);
    viewerPane.current = (
      <AppComponent
        newWindow={newWindowFromDSPath}
        clipboard={navigator.clipboard}
        openURL={openURL}
        showDataSources={false}
        embedded={true}
        rightFooterSlot={rightFooterSlot}
        onFilter={onFilter}
      />
    );
  }
  return viewerPane.current;
}

export interface TadViewerPaneProps {
  baseSqlQuery: string;
  dsConn: DataSourceConnection;
  errorCallback?: (e: Error) => void;
  setLoadingCallback: (loading: boolean) => void;
  showRecordCount: boolean;
  showColumnHistograms: boolean;
  rightFooterSlot?: JSX.Element;
  onFilter?: (filterExp: FilterExp) => void;
  onViewQuery?: (query: QueryExp, offset?: number, limit?: number) => void;
  onViewRowCount?: (
    query: QueryExp,
    type: "filtered" | "unfiltered" | "view"
  ) => void;
  onViewRowCountResolved?: (
    query: QueryExp,
    rowCount: number,
    type: "filtered" | "unfiltered" | "view"
  ) => void;
}

export function TadViewerPane({
  baseSqlQuery,
  dsConn,
  errorCallback,
  setLoadingCallback,
  showRecordCount,
  showColumnHistograms,
  rightFooterSlot,
  onFilter,
  onViewQuery,
  onViewRowCount,
  onViewRowCountResolved,
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
      const rtc = LocalReltabConnection.getInstance();

      if (!appStateRef) {
        const appState = new AppState({
          showRecordCount,
        });
        const stateRef = mkRef(appState);
        setAppStateRef(stateRef);
        await initAppState(rtc, stateRef);
        const preq = new PivotRequester(
          stateRef,
          errorCallback,
          setLoadingCallback,
          onViewQuery,
          onViewRowCount,
          onViewRowCountResolved
        );
        setPivotRequester(preq);
      }
    }
    initTadAppState();
  }, []);

  /* update the view when the query changes */
  React.useEffect(() => {
    if (appStateRef != null && pivotRequester != null) {
      actions.setQueryView(
        appStateRef,
        dsConn,
        baseSqlQuery,
        showColumnHistograms
      );
    }
  }, [baseSqlQuery, pivotRequester, appStateRef]);

  /* update showColumnHistograms when it changes */
  React.useEffect(() => {
    if (appStateRef != null) {
      const appState = mutableGet(appStateRef);
      if (appState.viewState) {
        actions.setShowColumnHistograms(appStateRef, showColumnHistograms);
      }
    }
  }, [showColumnHistograms, appStateRef]);

  let tadAppElem: JSX.Element | null = null;
  if (pivotRequester && appStateRef) {
    tadAppElem = (
      <TadViewerPaneInner
        baseQuery={baseSqlQuery}
        stateRef={appStateRef}
        rightFooterSlot={rightFooterSlot}
        onFilter={onFilter}
      />
    );
  }
  return tadAppElem;
}
