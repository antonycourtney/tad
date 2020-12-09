import * as React from "react";
import { ActivityBar } from "./ActivityBar";
import { PivotSidebar } from "./PivotSidebar";
import { DataSourceSidebar } from "./DataSourceSidebar";
import { DndProvider } from "react-dnd";
import Backend from "react-dnd-html5-backend";
import {
  FocusStyleManager,
  Button,
  Dialog,
  Classes,
  ProgressBar,
} from "@blueprintjs/core";
import { GridPane } from "./GridPane";
import { Footer } from "./Footer";
import { LoadingModal } from "./LoadingModal";
import * as actions from "../actions";
import { AppState } from "../AppState";
import * as oneref from "oneref";
import { useState } from "react";
import { Activity } from "./defs";

/**
 * top level application pane
 */

export interface AppPaneBaseProps {}

type AppPaneProps = AppPaneBaseProps & oneref.StateRefProps<AppState>;

export const AppPane: React.FunctionComponent<AppPaneProps> = ({
  appState,
  stateRef,
}: AppPaneProps) => {
  const [activity, setActivity] = useState<Activity>("None");
  const dataSourceExpanded = activity === "DataSource";
  const pivotPropsExpanded = activity === "Pivot";
  const [grid, setGrid] = useState<any>(null);
  let mainContents: JSX.Element | null = null;

  // console.log("AppPane: ", appState.toJS());

  const { viewState } = appState;

  let centerPane: JSX.Element;

  // We should probably make pivot sidebar deal better with an empty table, but...
  let pivotSidebar: JSX.Element | null;

  if (appState.initialized && viewState.dataView !== null) {
    pivotSidebar = (
      <PivotSidebar
        expanded={pivotPropsExpanded}
        schema={viewState.baseSchema}
        viewParams={viewState.viewParams}
        stateRef={stateRef}
      />
    );
    centerPane = (
      <div className="center-app-pane">
        <GridPane
          onSlickGridCreated={(grid) => setGrid(grid)}
          appState={appState}
          viewState={appState.viewState}
          stateRef={stateRef}
        />
        <Footer appState={appState} stateRef={stateRef} />
      </div>
    );
  } else {
    pivotSidebar = null;
    centerPane = <LoadingModal />;
  }
  mainContents = (
    <div className="container-fluid full-height main-container">
      <DndProvider backend={Backend}>
        <ActivityBar
          activity={activity}
          setActivity={setActivity}
          stateRef={stateRef}
        />
        <DataSourceSidebar expanded={dataSourceExpanded} stateRef={stateRef} />
        {pivotSidebar}
        {centerPane}
      </DndProvider>
    </div>
  );
  return mainContents;
};

/*
class AppPane extends React.Component {
  grid: any;

  handleSlickGridCreated(grid: any) {
    this.grid = grid;
  }
  /*
   * Attempt to scroll column into view on click in column selector
   *
   * Doesn't actually seem to work reliably in practice; seems like a
   * bug in SlickGrid, so is turned off.
   *
   * add  onColumnClick={cid => this.handleColumnClick(cid)} to
   * Sidebar to re-enable.
   *


  handleColumnClick(cid: string) {
    if (this.grid) {
      const columnIdx = this.grid.getColumnIndex(cid);

      if (columnIdx !== undefined) {
        const vp = this.grid.getViewport();
        this.grid.scrollCellIntoView(vp.top, columnIdx);
      }
    }
  }

  handleFilterToggled(isShown: boolean) {
    if (this.grid) {
      // put this on a timer so that it happens after animated transition:
      setTimeout(() => {
        this.grid.resizeCanvas();
      }, 350);
    }
  }

  componentDidMount() {
    FocusStyleManager.onlyShowFocusOnTabs();
  }

  handleExportDialogClose() {
    actions.setExportDialogOpen(false, '', this.props.stateRef);
  }

  render() {
    const appState = this.props.appState;
    let mainContents;

    if (appState.initialized) {
      const viewState = appState.viewState;
      const viewParams = viewState.viewParams;
      const queryView = appState.viewState.queryView;
      let filterCountStr = '';

      if (queryView) {
        const {
          filterRowCount
        } = queryView;
        filterCountStr = filterRowCount.toLocaleString(undefined, {
          grouping: true
        });
      }

      mainContents = <div className='container-fluid full-height main-container'>
          <Sidebar baseSchema={appState.baseSchema} viewParams={viewParams} stateRef={this.props.stateRef} />
          <div className='center-app-pane'>
            <GridPane onSlickGridCreated={grid => this.handleSlickGridCreated(grid)} appState={appState} viewState={viewState} stateRef={this.props.stateRef} />
            <Footer appState={appState} viewState={viewState} stateRef={this.props.stateRef} />
          </div>
          <Dialog title='Export Filtered CSV' onClose={() => this.handleExportDialogClose()} isOpen={appState.exportDialogOpen}>
            <div className={Classes.DIALOG_BODY}>
              <p className="bp3-text-large">Exporting {filterCountStr} rows to {appState.exportFilename}</p>
              <ProgressBar stripes={false} value={appState.exportPercent} />
            </div>
            <div className={Classes.DIALOG_FOOTER}>
              <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                <Button disabled={appState.exportPercent < 1} onClick={() => this.handleExportDialogClose()}>OK</Button>
              </div>
            </div>
          </Dialog>
        </div>;
    } else {
      mainContents = <div className='container-fluid full-height main-container'>
          <LoadingModal />
        </div>;
    }

    return mainContents;
  }
}

export DragDropContext(HTML5Backend)(AppPane);
*/
