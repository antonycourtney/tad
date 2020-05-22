import * as React from "react";
import * as reltab from "reltab";
import { AppState } from "../AppState";
// import type {Scalar} from '../reltab' // eslint-disable-line
import { Button, NumericInput } from "@blueprintjs/core";
import AsyncSelect from "react-select/async";
import { StateRef } from "oneref";
import { render } from "react-dom";
import { useState } from "react";
type Option = { value: string; label: string };
type OptionsRet = Option[];
type OptionsLoader = (input: string) => Promise<OptionsRet>;
const { col, constVal } = reltab;

const validRow = (
  columnId: string | null,
  op: reltab.RelOp | null,
  value: reltab.Scalar | Array<Option>
): boolean => {
  if (columnId != null && op != null) {
    return reltab.opIsUnary(op) || value != null;
  }
  return false;
};

const mkColValsLoader = (
  appState: AppState,
  columnId: string
): OptionsLoader => {
  const rtc = appState.rtc;
  const baseQuery = appState.baseQuery;
  return async (input: string): Promise<OptionsRet> => {
    let dq = baseQuery.distinct(columnId);
    if (input.length > 0) {
      dq = dq.filter(reltab.and().contains(col(columnId), constVal(input)));
    }
    const qres = await rtc.evalQuery(dq, 0, 50);
    const colData = qres.rowData
      .map((r) => r[columnId])
      .filter((v) => v != null);
    const options: Option[] = colData.map((cv) => ({
      value: cv as string,
      label: cv as string,
    }));
    console.log('colValsLoader: input: "', input, '", returning: ', options);
    return options;
  };
};

const mkRelExp = (
  columnId: string,
  op: reltab.RelOp,
  value: reltab.Scalar | Option[]
): reltab.RelExp => {
  let ret;
  if (reltab.opIsUnary(op)) {
    ret = new reltab.UnaryRelExp(op as reltab.UnaryRelOp, reltab.col(columnId));
  } else {
    let expValue: any = value;
    if (op === "IN" || op === "NOTIN") {
      expValue = (value as Option[]).map((opt) => opt.value);
    }
    ret = new reltab.BinRelExp(
      op as reltab.BinRelOp,
      reltab.col(columnId),
      reltab.constVal(expValue)
    );
  }
  return ret;
};

export interface FilterEditorRowProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  schema: reltab.Schema;
  relExp: reltab.RelExp | null;
  onDeleteRow: () => void;
  onUpdate: (fe: reltab.RelExp | null) => void;
}

const getBinOpVal = (
  relExp: reltab.BinRelExp | reltab.UnaryRelExp | null
): any => {
  if (
    relExp &&
    relExp.expType === "BinRelExp" &&
    relExp.rhs.expType === "ConstVal"
  ) {
    return relExp.rhs.val;
  }
  return null;
};

const getExpVal = (
  relExp: reltab.BinRelExp | reltab.UnaryRelExp | null
): any => {
  if (relExp === null) return null;
  const op = relExp.op;
  const expVal = getBinOpVal(relExp);
  let value = expVal;
  if ((op === "IN" || op === "NOTIN") && expVal != null) {
    value = expVal.map((cv: any) => ({ value: cv, label: cv }));
  }
  return value;
};

export const FilterEditorRow: React.FunctionComponent<FilterEditorRowProps> = ({
  appState,
  stateRef,
  schema,
  relExp,
  onDeleteRow,
  onUpdate,
}: FilterEditorRowProps) => {
  const [columnId, setColumnId] = useState(relExp ? relExp.lhsCol() : null);
  const [op, setOp] = useState(relExp ? relExp.op : null);
  const [value, setValue] = useState(getExpVal(relExp));

  /* validate row and notify if valid */
  const handleUpdate = (
    nextColumnId: string | null,
    nextOp: reltab.RelOp | null,
    nextValue: reltab.Scalar | Option[]
  ) => {
    if (onUpdate) {
      if (validRow(nextColumnId, nextOp, nextValue)) {
        const relExp = mkRelExp(nextColumnId!, nextOp!, nextValue!);
        onUpdate(relExp);
      } else {
        onUpdate(null);
      }
    }
  };

  const handleColumnSelect = (event: any) => {
    const sval = event.target.value;
    const nextColumnId = sval === "" ? null : sval;
    setColumnId(sval === "" ? null : sval);
    setOp(null);
    setValue(null);
    handleUpdate(nextColumnId, op, value);
  };

  const handleOpSelect = (event: any) => {
    const sval = event.target.value;
    const nextOp = sval === "" ? null : sval;
    setOp(nextOp);
    handleUpdate(columnId, nextOp, value);
  };

  const handleSelectChange = (nextValue: Array<Option>) => {
    setValue(nextValue);
    handleUpdate(columnId, op, nextValue);
  };

  const handleValueChange = (nextValue: any) => {
    setValue(nextValue);
    handleUpdate(columnId, op, nextValue);
  };

  const handleDeleteRow = () => {
    if (onDeleteRow) {
      onDeleteRow();
    }
  };

  const columnChoices = schema.sortedColumns();
  const colOpts = columnChoices.map((cid) => (
    <option key={"filterRowColSel-" + cid} value={cid}>
      {schema.displayName(cid)}
    </option>
  ));
  const selectVal = columnId == null ? "" : columnId;
  const colSelect = (
    <div className="bp3-select filter-row-col-select">
      <select value={selectVal} onChange={(event) => handleColumnSelect(event)}>
        <option value="">Column...</option>
        {colOpts}
      </select>
    </div>
  );

  let opChoices: JSX.Element[] = [];
  let opDisabled = false;
  if (columnId != null) {
    const colType = schema.columnType(columnId);
    const ops = reltab.columnTypeOps(colType);
    opChoices = ops.map((opc, idx) => (
      <option key={"relop-" + idx} value={opc}>
        {reltab.opDisplayName(opc)}
      </option>
    ));
  } else {
    opDisabled = true;
  }
  const opVal = op === null ? "" : op;
  const opSelect = (
    <div className="bp3-select filter-row-op-select">
      <select
        value={opVal}
        disabled={opDisabled}
        onChange={(event) => handleOpSelect(event)}
      >
        <option value="">Operator...</option>
        {opChoices}
      </select>
    </div>
  );

  let valDisabled = columnId == null || op == null || !reltab.opIsBinary(op);

  let valInput: JSX.Element | null = null;
  if (columnId != null) {
    const columnType = schema.columnType(columnId);
    if (reltab.colIsNumeric(columnType)) {
      valInput = (
        <NumericInput
          onValueChange={(v) => handleValueChange(v)}
          placeholder="Value"
          disabled={valDisabled}
          value={value}
        />
      );
    }
    if (valInput == null) {
      const compVal = value ? value : ""; // eslint-disable-line
      if (op === "IN" || op === "NOTIN") {
        const loader = mkColValsLoader(appState, columnId);
        /* Adding 'key' here as proposed workaround for
         * https://github.com/JedWatson/react-select/issues/1771
         */
        valInput = (
          <AsyncSelect
            className="filter-editor-value"
            classNamePrefix="filter-editor-value"
            name="in-op"
            value={compVal}
            key={compVal.length}
            getOptionLabel={(opt) => opt.label}
            getOptionValue={(opt) => opt.value}
            isMulti
            cacheOptions
            defaultOptions
            closeMenuOnSelect={false}
            loadOptions={loader}
            onChange={(val) => handleSelectChange(val)}
          />
        );
      } else {
        valInput = (
          <input
            className="bp3-input filter-editor-value"
            type="text"
            placeholder="Value"
            disabled={valDisabled}
            value={compVal}
            onChange={(e) => handleValueChange(e.target.value)}
            dir="auto"
          />
        );
      }
    }
  }

  const clearStyle: React.CSSProperties = { clear: "both" };
  return (
    <div className="filter-editor-row">
      <div className="filter-editor-row-predicate">
        {colSelect}
        {opSelect}
        {valInput}
      </div>
      <Button
        className="bp3-minimal"
        icon="delete"
        onClick={(e: any) => handleDeleteRow()}
      />
      <div id="clear" style={clearStyle} />
    </div>
  );
};
