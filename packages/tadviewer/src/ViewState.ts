import * as Immutable from "immutable";
import { ViewParams } from "./ViewParams";
import { QueryView } from "./QueryView";
import { PagedDataView } from "./PagedDataView";
import { Timer } from "./Timer";
/**
 * Immutable representation of all state associated
 * with a single view.
 *
 * Consists of user-editable ViewParams plus any associated
 * query / network / render state
 */
export interface ViewStateProps {
  viewParams: ViewParams;
  loadingTimer: Timer;
  viewportTop: number;
  viewportBottom: number;
  queryView: QueryView | undefined | null;
  dataView: PagedDataView | undefined | null;
}

const defaultViewStateProps: ViewStateProps = {
  viewParams: new ViewParams(),
  loadingTimer: new Timer(),
  viewportTop: 0,
  viewportBottom: 0,
  queryView: null,
  dataView: null
};

export class ViewState extends Immutable.Record(defaultViewStateProps)
  implements ViewStateProps {
  public readonly viewParams!: ViewParams;
  public readonly loadingTimer!: Timer;
  public readonly viewportTop!: number;
  public readonly viewportBottom!: number;
  public readonly queryView!: QueryView | undefined | null;
  public readonly dataView!: PagedDataView | undefined | null;
}
