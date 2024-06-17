import * as React from "react";
import { default as ReactDefault } from "react";
import { ActivityBar } from "./ActivityBar";
import { PivotSidebar } from "./PivotSidebar";
import { DataSourceSidebar } from "./DataSourceSidebar";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  FocusStyleManager,
  Button,
  Dialog,
  Classes,
  ProgressBar,
  FormGroup,
  InputGroup,
} from "@blueprintjs/core";
import { GridPane, OpenURLFn } from "./GridPane";
import { Footer } from "./Footer";
import { LoadingModal } from "./LoadingModal";
import * as actions from "../actions";
import { AppState } from "../AppState";
import * as oneref from "oneref";
import { useState } from "react";
import { Activity } from "./defs";
import { mutableGet, StateRef } from "oneref";
import { DataSourcePath, ReltabConnection, resolvePath } from "reltab";
import { useDeepCompareEffect } from "use-deep-compare";
import { Timer } from "../Timer";
import { SimpleClipboard } from "./SimpleClipboard";
import { createDragDropManager } from "dnd-core";
import { type FilterExp } from "reltab";
/**
 * top level application pane
 */

export type NewWindowFn = (
  path: DataSourcePath,
  stateRef: StateRef<AppState>
) => void;

export interface AppPaneBaseProps {
  newWindow: NewWindowFn;
  openURL: OpenURLFn;
  showDataSources?: boolean;
  clipboard: SimpleClipboard;
  embedded: boolean;
  rightFooterSlot?: JSX.Element;
  onFilter?: (filterExp: FilterExp) => void;
  onBrowseExportPath?: () => void;
}

export type AppPaneProps = AppPaneBaseProps & oneref.StateRefProps<AppState>;

const handleExportBeginDialogClose = (stateRef: StateRef<AppState>) => {
  actions.setExportBeginDialogOpen(false, stateRef);
};

const handleExportProgressDialogClose = (stateRef: StateRef<AppState>) => {
  actions.setExportProgressDialogOpen(false, "", stateRef);
};

const handleViewConfirmDialogReplace = async (stateRef: StateRef<AppState>) => {
  const appState = mutableGet(stateRef);
  actions.setViewConfirmDialogOpen(false, null, stateRef);
  actions.replaceCurrentView(appState.viewConfirmSourcePath!, stateRef);
};

const handleViewConfirmDialogNewWindow = (
  newWindow: NewWindowFn,
  stateRef: StateRef<AppState>
) => {
  const appState = mutableGet(stateRef);
  actions.setViewConfirmDialogOpen(false, null, stateRef);
  newWindow(appState.viewConfirmSourcePath!, stateRef);
};

const handleViewConfirmDialogClose = (stateRef: StateRef<AppState>) => {
  actions.setViewConfirmDialogOpen(false, null, stateRef);
};

type ExportDialogProps = oneref.StateRefProps<AppState>;

const ExportProgressDialog: React.FunctionComponent<ExportDialogProps> = ({
  appState,
  stateRef,
}: ExportDialogProps) => {
  let filterCountStr = "";

  const { viewState } = appState;

  if (
    appState.initialized &&
    viewState !== null &&
    viewState.dataView !== null
  ) {
    const viewParams = viewState.viewParams;
    const queryView = appState.viewState.queryView;

    if (queryView) {
      const { filterRowCount } = queryView;
      filterCountStr = filterRowCount.toLocaleString(undefined, {
        useGrouping: true,
      });
    }
  }
  return (
    <Dialog
      title="Export Filtered CSV"
      onClose={() => handleExportProgressDialogClose(stateRef)}
      isOpen={appState.exportDialogOpen}
    >
      <div className={Classes.DIALOG_BODY}>
        <p className="bp4-text-large">
          Exporting {filterCountStr} rows to {appState.exportPath}
        </p>
        <ProgressBar stripes={false} value={appState.exportPercent} />
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button
            disabled={appState.exportPercent < 1}
            onClick={() => handleExportProgressDialogClose(stateRef)}
          >
            OK
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

type ExportBeginDialogProps = oneref.StateRefProps<AppState> & {
  onBrowseExportPath?: () => void;
};

const ExportBeginDialog: React.FunctionComponent<ExportBeginDialogProps> = ({
  appState,
  stateRef,
  onBrowseExportPath,
}: ExportBeginDialogProps) => {
  let filterCountStr = "";

  const { viewState, exportPath } = appState;

  if (
    appState.initialized &&
    viewState !== null &&
    viewState.dataView !== null
  ) {
    const viewParams = viewState.viewParams;
    const queryView = appState.viewState.queryView;

    if (queryView) {
      const { filterRowCount } = queryView;
      filterCountStr = filterRowCount.toLocaleString(undefined, {
        useGrouping: true,
      });
    }
  }
  return (
    <Dialog
      title="Export"
      onClose={() => handleExportBeginDialogClose(stateRef)}
      isOpen={appState.exportBeginDialogOpen}
    >
      <div className={Classes.DIALOG_BODY}>
        <p className="bp4-text-large">Export {filterCountStr} rows</p>
        <FormGroup
          inline={true}
          label="File Format"
          labelFor="export-format-select"
        >
          <div className="bp4-html-select bp4-inline">
            <select id="export-format-select">
              <option selected>Parquet</option>
              <option value="1">CSV</option>
            </select>
            <span className="bp4-icon bp4-icon-double-caret-vertical"></span>
          </div>
        </FormGroup>
        <FormGroup label="Export Path" labelFor="export-path">
          <InputGroup
            id="export-path"
            value={exportPath}
            onChange={(e) => actions.setExportPath(e.target.value, stateRef)}
            rightElement={
              <Button
                icon="folder-open"
                minimal
                onClick={(e) => onBrowseExportPath?.()}
              />
            }
          />
        </FormGroup>
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button
            disabled={appState.exportPercent < 1}
            onClick={() => handleExportBeginDialogClose(stateRef)}
          >
            OK
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

interface ViewConfirmDialogBaseProps {
  newWindow: NewWindowFn;
}

type ViewConfirmDialogProps = ViewConfirmDialogBaseProps &
  oneref.StateRefProps<AppState>;

const ViewConfirmDialog: React.FunctionComponent<ViewConfirmDialogProps> = ({
  newWindow,
  appState,
  stateRef,
}: ViewConfirmDialogProps) => {
  return (
    <Dialog
      title="Open Table"
      onClose={() => handleViewConfirmDialogClose(stateRef)}
      isOpen={appState.viewConfirmDialogOpen}
    >
      <div className={Classes.DIALOG_BODY}>
        <p className="bp4-text-large">
          You have unsaved changes to the current view. <br />
          Do you want to:
        </p>
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button onClick={() => handleViewConfirmDialogReplace(stateRef)}>
            Replace Current View
          </Button>
          <Button
            onClick={() =>
              handleViewConfirmDialogNewWindow(newWindow, stateRef)
            }
          >
            Open in New Window
          </Button>
          <Button
            intent="primary"
            onClick={() => handleViewConfirmDialogClose(stateRef)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

async function setTitleFromDSPath(
  rtc: ReltabConnection,
  dsPath: DataSourcePath
) {
  const node = await resolvePath(rtc, dsPath);
  const title = "Tad - " + node.displayName;
  document.title = title;
}

function timerShowModal(timer: Timer): boolean {
  return timer.running && timer.elapsed > 500;
}

const dndManager = createDragDropManager(HTML5Backend);

export const AppPane: React.FunctionComponent<AppPaneProps> = ({
  newWindow,
  appState,
  stateRef,
  clipboard,
  showDataSources: rawShowDataSources,
  openURL,
  embedded,
  rightFooterSlot,
  onFilter,
  onBrowseExportPath,
}: AppPaneProps) => {
  const { activity, exportBeginDialogOpen } = appState;
  const dataSourceExpanded = activity === "DataSource";
  const pivotPropsExpanded = activity === "Pivot";
  let mainContents: JSX.Element | null = null;
  const showDataSources =
    rawShowDataSources === undefined ? true : rawShowDataSources;

  const { rtc, viewState } = appState;

  let dsPath = viewState?.dsPath;

  useDeepCompareEffect(() => {
    if (rtc && dsPath) {
      setTitleFromDSPath(rtc, dsPath);
    }
  }, [dsPath]);

  let centerPane: JSX.Element | null;

  // We should probably make pivot sidebar deal better with an empty table, but...
  let pivotSidebar: JSX.Element | null;

  if (
    appState.initialized &&
    viewState !== null &&
    viewState.dataView !== null
  ) {
    pivotSidebar = (
      <PivotSidebar
        expanded={pivotPropsExpanded}
        schema={viewState.baseSchema}
        viewParams={viewState.viewParams}
        delayedCalcMode={viewState.delayedCalcMode}
        embedded={embedded}
        stateRef={stateRef}
      />
    );
    const loadingModal =
      timerShowModal(appState.appLoadingTimer) ||
      timerShowModal(viewState.loadingTimer) ? (
        <LoadingModal embedded={embedded} />
      ) : null;
    centerPane = (
      <div className="center-app-pane">
        {loadingModal}
        <GridPane
          appState={appState}
          viewState={appState.viewState}
          stateRef={stateRef}
          clipboard={clipboard}
          openURL={openURL}
          embedded={embedded}
        />
        <Footer
          appState={appState}
          stateRef={stateRef}
          rightFooterSlot={rightFooterSlot}
          onFilter={onFilter}
        />
      </div>
    );
  } else {
    pivotSidebar = null;
    centerPane = timerShowModal(appState.appLoadingTimer) ? (
      <LoadingModal embedded={embedded} />
    ) : null;
  }
  const dataSourceSidebar = showDataSources ? (
    <DataSourceSidebar expanded={dataSourceExpanded} stateRef={stateRef} />
  ) : null;
  mainContents = (
    <div className="container-fluid full-height main-container tad-app-pane">
      <DndProvider manager={dndManager}>
        <ActivityBar
          activity={activity}
          showDataSources={showDataSources}
          stateRef={stateRef}
        />
        {dataSourceSidebar}
        {pivotSidebar}
        {centerPane}
      </DndProvider>
      <ExportBeginDialog
        appState={appState}
        stateRef={stateRef}
        onBrowseExportPath={onBrowseExportPath}
      />
      <ExportProgressDialog appState={appState} stateRef={stateRef} />
      <ViewConfirmDialog
        newWindow={newWindow}
        appState={appState}
        stateRef={stateRef}
      />
    </div>
  );
  return mainContents;
};

// Useful for checking for duplicate React versions
export const tadReact = ReactDefault;
