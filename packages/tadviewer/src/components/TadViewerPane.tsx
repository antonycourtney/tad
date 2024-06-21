/**
 * A Tad Viewer pane for embedding a tad view of a SQL query on a data source
 */
import log from "loglevel";
import { mkRef, mutableGet, refContainer, StateRef } from "oneref";
import * as React from "react";
import { useMemo, useRef, useState } from "react";
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
import { show } from "@blueprintjs/core/lib/esm/components/context-menu/contextMenu";
import { showHotkeysDialog } from "@blueprintjs/core/lib/esm/components/hotkeys/hotkeysDialog";

interface TadViewerPaneInnerProps {
  stateRef: StateRef<AppState>;
  baseQuery: string;
  rightFooterSlot?: JSX.Element;
  onFilter?: (filterExp: FilterExp) => void;
  showSidebar?: boolean;
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
  showSidebar,
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
        showSidebar={showSidebar}
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
  showSidebar?: boolean; // show activity bar and sidebar?
  onViewQuery?: (query: QueryExp, offset?: number, limit?: number) => void;
  onViewRowCount?: (query: QueryExp) => void;
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
  showSidebar,
  onViewQuery,
  onViewRowCount,
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
          onViewRowCount
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
        showSidebar={showSidebar}
      />
    );
  }
  return tadAppElem;
}
