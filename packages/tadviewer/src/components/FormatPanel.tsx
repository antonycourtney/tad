import * as React from "react";
import { TextFormatPanel } from "./TextFormatPanel";
import { NumFormatPanel } from "./NumFormatPanel";
import { RadioGroup, Radio } from "@blueprintjs/core";
import * as actions from "../actions";
import * as reltab from "reltab";
import { ViewParams, FormatOptions } from "../ViewParams";
import { StateRef } from "oneref";
import { AppState } from "../AppState";
import { useState } from "react";
import { NumFormatOptions } from "../NumFormatOptions";
import { TextFormatOptions } from "../TextFormatOptions";
import { ColumnType, ColumnKind } from "reltab";

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
  const [colKind, setColKind] = useState("string" as ColumnKind);
  const [selectedColumn, setSelectedColumn] = useState(firstCol);

  const handleFormatKind = (event: any) => {
    setFormatKind(event.target.value);
  };

  // column type select handler
  const handleTypeSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setColKind(event.target.value as ColumnKind);
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

  let componentColKind: ColumnKind;
  let currentOpts: FormatOptions;
  let changeHandler: any;

  if (formatKind === "default") {
    componentColKind = colKind;
    currentOpts = viewParams.defaultFormats.get(colKind);

    changeHandler = (fopts: any) =>
      actions.setDefaultFormatOptions(colKind, fopts, stateRef);
  } else {
    componentColKind = schema.columnType(selectedColumn!).kind;
    currentOpts = viewParams.getColumnFormat(schema, selectedColumn!);

    changeHandler = (fopts: any) =>
      actions.setColumnFormatOptions(selectedColumn!, fopts, stateRef);
  }

  let formatPanel: JSX.Element | null;
  switch (componentColKind) {
    case "string":
      formatPanel = (
        <TextFormatPanel
          opts={currentOpts as TextFormatOptions}
          onChange={changeHandler}
        />
      );
      break;
    case "integer":
    case "real":
      formatPanel = (
        <NumFormatPanel
          opts={currentOpts as NumFormatOptions}
          onChange={changeHandler}
        />
      );
      break;
    default:
      formatPanel = null;
  }

  const colKindSelect = (
    <select
      disabled={formatKind !== "default"}
      value={colKind}
      onChange={(event) => handleTypeSelect(event)}
    >
      <option value="string">string</option>
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
            {colKindSelect}
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
