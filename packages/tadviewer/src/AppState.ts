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
  dbc: reltab.DbConnection | null;
  targetPath: string;
  baseQuery: reltab.QueryExp | null;
  baseSchema: reltab.Schema | null; // always in sync with baseQuery

  viewState: ViewState;
  exportDialogOpen: boolean;
  exportFilename: string;
  exportPercent: number;
}

const defaultAppStateProps: AppStateProps = {
  initialized: false,
  windowTitle: "",
  rtc: null,
  dbc: null,
  targetPath: "",
  // path to CSV file
  baseQuery: null,
  baseSchema: null,
  viewState: new ViewState(),
  exportDialogOpen: false,
  exportFilename: "",
  exportPercent: 0,
};

export class AppState extends Immutable.Record(defaultAppStateProps) {
  public readonly initialized!: boolean; // Has main process initialization completed?

  public readonly windowTitle!: string; // Usually just the table name or file name

  public readonly rtc!: reltab.ReltabConnection;
  public readonly dbc!: reltab.DbConnection;
  public readonly targetPath!: string;
  public readonly baseQuery!: reltab.QueryExp;
  public readonly baseSchema!: reltab.Schema; // always in sync with baseQuery

  public readonly viewState!: ViewState;
  public readonly exportDialogOpen!: boolean;
  public readonly exportFilename!: string;
  public readonly exportPercent!: number;
}
