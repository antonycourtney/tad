import * as React from "react";
import { TextFormatPanel } from "./TextFormatPanel";
import { NumFormatPanel } from "./NumFormatPanel";
import { RadioGroup, Radio } from "@blueprintjs/core";
import * as actions from "../actions";
import * as reltab from "reltab";
import { ViewParams } from "../ViewParams";
import { StateRef } from "oneref";
import { AppState } from "../AppState";
import { useState } from "react";
import { NumFormatOptions } from "../NumFormatOptions";
import { TextFormatOptions } from "../TextFormatOptions";

export interface FormatPanelProps {
  schema: reltab.Schema;
  viewParams: ViewParams;
  stateRef: StateRef<AppState>;
}

export const FormatPanel: React.FC<FormatPanelProps> = ({
  schema,
  viewParams,
  stateRef,
}) => {
  const firstCol =
    schema.columns && schema.columns.length > 0 ? schema.columns[0] : undefined;
  const [formatKind, setFormatKind] = useState("default");
  const [colType, setColType] = useState("text");
  const [selectedColumn, setSelectedColumn] = useState(firstCol);

  const handleFormatKind = (event: any) => {
    setFormatKind(event.target.value);
  };

  // column type select handler
  const handleTypeSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setColType(event.target.value);
  };

  const handleColumnSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedColumn(event.target.value);
  };

  // render a select for columns of type colType:
  const typeCols = schema.sortedColumns();
  const colOpts = typeCols.map((cid) => (
    <option key={"colSel-" + cid} value={cid}>
      {schema.displayName(cid)}
    </option>
  ));
  const columnSelect = (
    <select
      className="format-col-select"
      disabled={formatKind !== "column"}
      value={selectedColumn}
      onChange={(event) => handleColumnSelect(event)}
    >
      {colOpts}
    </select>
  );

  const subPanelComponentForType = (columnType: string) =>
    columnType === "text" ? TextFormatPanel : NumFormatPanel;

  let componentColType: string;
  let currentOpts: any;
  let changeHandler: any;

  if (formatKind === "default") {
    componentColType = colType;
    currentOpts = viewParams.defaultFormats.get(colType);

    changeHandler = (fopts: any) =>
      actions.setDefaultFormatOptions(colType, fopts, stateRef);
  } else {
    componentColType = schema.columnType(selectedColumn!);
    currentOpts = viewParams.getColumnFormat(schema, selectedColumn!);

    changeHandler = (fopts: any) =>
      actions.setColumnFormatOptions(selectedColumn!, fopts, stateRef);
  }

  const PanelComponent = subPanelComponentForType(componentColType);
  const formatPanel = (
    <PanelComponent opts={currentOpts} onChange={changeHandler} />
  );

  const colTypeSelect = (
    <select
      disabled={formatKind !== "default"}
      value={colType}
      onChange={(event) => handleTypeSelect(event)}
    >
      <option value="text">text</option>
      <option value="integer">integer</option>
      <option value="real">real</option>
    </select>
  );
  return (
    <div className="ui-block">
      <h6>Apply To</h6>
      <div className="bp3-form-group">
        <RadioGroup
          selectedValue={formatKind}
          onChange={(event) => handleFormatKind(event)}
        >
          <Radio label="Default for Columns of Type " value="default">
            {colTypeSelect}
          </Radio>
          <Radio label="Specific Column " value="column">
            {columnSelect}
          </Radio>
        </RadioGroup>
      </div>
      <h6>Format Properties</h6>
      {formatPanel}
    </div>
  );
};
