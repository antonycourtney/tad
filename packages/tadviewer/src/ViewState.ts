import * as Immutable from "immutable";
import { ViewParams } from "./ViewParams";
import { QueryView } from "./QueryView";
import { PagedDataView } from "./PagedDataView";
import { Timer } from "./Timer";
import * as reltab from "reltab";
import { DataSourcePath } from "reltab";

/**
 * Immutable representation of all state associated
 * with a single view.
 *
 * Consists of user-editable ViewParams plus any associated
 * query / network / render state
 */
export interface ViewStateProps {
  dbc: reltab.DbConnection | null;
  path: DataSourcePath;
  baseQuery: reltab.QueryExp | null;
  baseSchema: reltab.Schema | null; // always in sync with baseQuery

  viewParams: ViewParams;
  loadingTimer: Timer;
  viewportTop: number;
  viewportBottom: number;
  queryView: QueryView | undefined | null;
  dataView: PagedDataView | undefined | null;
}

const defaultViewStateProps: ViewStateProps = {
  dbc: null,
  path: [],
  baseQuery: null,
  baseSchema: null,
  viewParams: new ViewParams(),
  loadingTimer: new Timer(),
  viewportTop: 0,
  viewportBottom: 0,
  queryView: null,
  dataView: null
};

export class ViewState extends Immutable.Record(defaultViewStateProps)
  implements ViewStateProps {
  public readonly dbc!: reltab.DbConnection;
  public readonly path!: DataSourcePath;
  public readonly baseQuery!: reltab.QueryExp;
  public readonly baseSchema!: reltab.Schema; // always in sync with baseQuery  
  public readonly viewParams!: ViewParams;
  public readonly loadingTimer!: Timer;
  public readonly viewportTop!: number;
  public readonly viewportBottom!: number;
  public readonly queryView!: QueryView | undefined | null;
  public readonly dataView!: PagedDataView | undefined | null;
}
