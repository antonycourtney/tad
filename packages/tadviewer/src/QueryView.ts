import * as Immutable from "immutable";
import * as reltab from "reltab";
/*
 * State needed for a scollable view of a reltab query
 */

export interface QueryViewProps {
  query: reltab.QueryExp | null;
  histoMap: reltab.ColumnHistogramMap | null;
  rowCount: number;
  baseRowCount: number;
  filterRowCount: number;
}

const defaultQueryViewProps: QueryViewProps = {
  query: null,
  histoMap: null,
  rowCount: 0,
  // The following fields are just for auxiliary info in footer
  baseRowCount: 0,
  filterRowCount: 0,
};

export class QueryView
  extends Immutable.Record(defaultQueryViewProps)
  implements QueryViewProps
{
  public readonly query!: reltab.QueryExp;
  public readonly histoMap!: reltab.ColumnHistogramMap;
  public readonly rowCount!: number;
  public readonly baseRowCount!: number;
  public readonly filterRowCount!: number;
}
