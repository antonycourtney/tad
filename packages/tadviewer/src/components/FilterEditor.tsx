import * as React from "react";
import * as reltab from "reltab";
import { AppState } from "../AppState";
import { Button } from "@blueprintjs/core";
import { FilterEditorRow } from "./FilterEditorRow";
import { StateRef } from "oneref";
import { useState } from "react";
import { FilterExp, SubExp } from "reltab";

type RefUpdater = (f: (s: AppState) => AppState) => void;

export interface FilterEditorProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  schema: reltab.Schema;
  filterExp: reltab.FilterExp | null;
  onCancel: (e: any) => void;
  onApply: (fe: reltab.FilterExp) => void;
  onDone: () => void;
}

const getOpArgs = (filterExp: FilterExp | null): (SubExp | null)[] => {
  if (filterExp === null) return [null];
  let { opArgs } = filterExp;
  if (!opArgs || opArgs.length === 0) {
    return [null];
  }
  return opArgs;
};

export const FilterEditor: React.FunctionComponent<FilterEditorProps> = ({
  appState,
  stateRef,
  schema,
  filterExp,
  onCancel,
  onApply,
  onDone,
}) => {
  const [op, setOp] = useState(filterExp != null ? filterExp.op : "AND");
  const [opArgs, setOpArgs] = useState(getOpArgs(filterExp));
  const [dirty, setDirty] = useState(false);

  const handleAddRow = () => {
    setOpArgs(opArgs.concat(null));
    setDirty(true);
  };

  const handleDeleteRow = (idx: number) => {
    const nextOpArgs = opArgs.slice();
    delete nextOpArgs[idx]; // delete, not splice, to keep React keys correct
    setOpArgs(nextOpArgs);
    setDirty(true);
  };

  const handleOpChange = (nextOp: reltab.BoolOp) => {
    setOp(nextOp);
    setDirty(true);
  };

  const handleUpdateRow = (idx: number, re: reltab.RelExp | null) => {
    const nextOpArgs = opArgs.slice();
    nextOpArgs[idx] = re;
    setOpArgs(nextOpArgs);
    setDirty(true);
  };

  const handleApply = () => {
    const nnOpArgs: any = opArgs.filter((r) => r != null);
    const fe = new reltab.FilterExp(op, nnOpArgs);
    onApply(fe);
    setDirty(false);
  };

  const handleDone = () => {
    handleApply();
    onDone();
  };

  const feRows = opArgs.map((re, idx) => {
    return (
      <FilterEditorRow
        appState={appState}
        stateRef={stateRef}
        key={"fe-row-" + idx}
        schema={schema}
        relExp={re as reltab.BinRelExp | reltab.UnaryRelExp}
        onDeleteRow={() => handleDeleteRow(idx)}
        onUpdate={(re) => handleUpdateRow(idx, re)}
      />
    );
  });

  return (
    <div className="filter-editor">
      <div className="filter-editor-filter-pane">
        <div className="filter-editor-select-row">
          <div className="bp3-select bp3-minimal">
            <select
              onChange={(e) => handleOpChange(e.target.value as reltab.BoolOp)}
            >
              <option value="AND">All Of (AND)</option>
              <option value="OR">Any Of (OR)</option>
            </select>
          </div>
        </div>
        <div className="filter-editor-edit-section">
          <div className="filter-editor-scroll-pane">
            {feRows}
            <div className="filter-editor-row">
              <div className="filter-edit-add-row">
                <Button
                  className="bp3-minimal"
                  icon="add"
                  onClick={(e: any) => handleAddRow()}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="filter-editor-footer">
        <Button text="Cancel" onClick={(e: any) => onCancel(e)} />
        <Button
          disabled={!dirty}
          text="Apply"
          onClick={(e: any) => handleApply()}
        />
        <Button
          className="bp3-intent-primary"
          onClick={(e: any) => handleDone()}
          text="Done"
        />
      </div>
    </div>
  );
};
