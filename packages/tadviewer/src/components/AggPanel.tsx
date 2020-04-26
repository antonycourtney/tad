import * as React from "react";
import { ColumnList } from "./ColumnList";
import { ColumnListType, ColumnListTypes } from "./defs";
import { aggFns, Schema } from "reltab";
import { AggFn } from "reltab"; // eslint-disable-line

import { ViewParams } from "../ViewParams";
import * as actions from "../actions";
import { StateRef } from "oneref";
import { AppState } from "../AppState";

const aggSelect = (
  viewParams: ViewParams,
  schema: Schema,
  cid: string,
  updater: any
) => {
  const colAggFn = viewParams.getAggFn(schema, cid);

  const mkOption = (aggName: string) => {
    const key = "agg-" + cid + "-" + aggName;
    return (
      <option key={key} value={aggName}>
        {aggName}
      </option>
    );
  };

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    console.log(
      "agg.handleChange: column: ",
      cid,
      "new agg: ",
      event.target.value
    );
    const aggFn: AggFn = event.target.value as AggFn;
    actions.setAggFn(cid, aggFn, updater);
  };

  const aggOptions = aggFns(schema.columnType(cid)).map(mkOption);
  return (
    <div className="bp3-select bp3-minimal">
      <select value={colAggFn} onChange={handleChange}>
        {aggOptions}
      </select>
    </div>
  );
};

const aggRowFormatter = (viewParams: ViewParams, stateRef: any) => (
  schema: Schema,
  cid: string
): JSX.Element[] => {
  const displayName = schema.displayName(cid);
  const select = aggSelect(viewParams, schema, cid, stateRef);
  return [
    <td key={cid} className="col-colName">
      {displayName}
    </td>,
    <td key={"aggFn-" + cid} className="aggFn">
      {select}
    </td>,
  ];
};

export interface AggPanelProps {
  schema: Schema;
  viewParams: ViewParams;
  stateRef: StateRef<AppState>;
}

export const AggPanel: React.FC<AggPanelProps> = ({
  schema,
  viewParams,
  stateRef,
}) => {
  const columnIds = schema.sortedColumns();
  return (
    <div className="ui-block">
      <h6>Aggregation Functions</h6>
      <ColumnList
        schema={schema}
        columnListType={ColumnListTypes.AGG}
        headerLabels={["Agg Fn"]}
        items={columnIds}
        rowFormatter={aggRowFormatter(viewParams, stateRef)}
        stateRef={stateRef}
      />
    </div>
  );
};
