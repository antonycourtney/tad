import * as Immutable from "immutable";
import { ViewState } from "./ViewState";
import * as reltab from "reltab";
import { DataSourcePath, DataSourceId } from "reltab";
import { Timer } from "./Timer";
import { Activity } from "./components/defs";
/**
 * Immutable representation of application state
 *
 * Just a single view in a single untabbed window for now.
 */

export interface AppStateProps {
  initialized: boolean; // Has main process initialization completed?

  windowTitle: string; // Usually just the table name or file name

  rtc: reltab.ReltabConnection | null;

  viewState: ViewState | null;
  exportDialogOpen: boolean;
  exportFilename: string;
  exportPercent: number;

  viewConfirmDialogOpen: boolean;
  viewConfirmSourcePath: DataSourcePath | null;

  appLoadingTimer: Timer;
  activity: Activity;
  showRecordCount: boolean;
}

const defaultAppStateProps: AppStateProps = {
  initialized: false,
  windowTitle: "",
  rtc: null,
  viewState: null,
  exportDialogOpen: false,
  exportFilename: "",
  exportPercent: 0,
  viewConfirmDialogOpen: false,
  viewConfirmSourcePath: null,
  appLoadingTimer: new Timer(),
  activity: "None",
  showRecordCount: true,
};

export class AppState extends Immutable.Record(defaultAppStateProps) {
  public readonly initialized!: boolean; // Has main process initialization completed?

  public readonly windowTitle!: string; // Usually just the table name or file name

  public readonly rtc!: reltab.ReltabConnection;

  public readonly viewState!: ViewState;
  public readonly exportDialogOpen!: boolean;
  public readonly exportFilename!: string;
  public readonly exportPercent!: number;
  public readonly viewConfirmDialogOpen!: boolean;
  public readonly viewConfirmSourcePath!: DataSourcePath | null;
  public readonly appLoadingTimer!: Timer;
  public readonly activity!: Activity;
  public readonly showRecordCount!: boolean;
}
