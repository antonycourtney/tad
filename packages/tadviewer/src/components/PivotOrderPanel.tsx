import * as React from "react";
import { ColumnList } from "./ColumnList";
import { ColumnListTypes } from "./defs";
import * as reltab from "reltab";
import { ViewParams } from "../ViewParams";
import { StateRef } from "oneref";
import { AppState } from "../AppState";

export interface PivotOrderPanelProps {
  schema: reltab.Schema;
  viewParams: ViewParams;
  stateRef: StateRef<AppState>;
}

export const PivotOrderPanel: React.FC<PivotOrderPanelProps> = ({
  schema,
  viewParams,
  stateRef,
}) => (
  <div className="ui-block">
    <h6 className="bp3-heading">
      Pivot Columns <span className="bp3-ui-text">(drag to reorder)</span>
    </h6>
    <ColumnList
      schema={schema}
      columnListType={ColumnListTypes.PIVOT}
      items={viewParams.vpivots}
      stateRef={stateRef}
    />
  </div>
);
