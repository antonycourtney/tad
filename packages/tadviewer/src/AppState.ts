import * as Immutable from "immutable";
import { ViewState } from "./ViewState";
import * as reltab from "reltab";
import { DbConnectionKey } from "reltab";
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
}

const defaultAppStateProps: AppStateProps = {
  initialized: false,
  windowTitle: "",
  rtc: null,
  viewState: null,
  exportDialogOpen: false,
  exportFilename: "",
  exportPercent: 0,
};

export class AppState extends Immutable.Record(defaultAppStateProps) {
  public readonly initialized!: boolean; // Has main process initialization completed?

  public readonly windowTitle!: string; // Usually just the table name or file name

  public readonly rtc!: reltab.ReltabConnection;

  public readonly viewState!: ViewState;
  public readonly exportDialogOpen!: boolean;
  public readonly exportFilename!: string;
  public readonly exportPercent!: number;
}
