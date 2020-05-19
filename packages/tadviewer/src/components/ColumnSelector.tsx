import * as React from "react";
import * as actions from "../actions";
import { IndeterminateCheckbox } from "./IndeterminateCheckbox";
import { ViewParams } from "../ViewParams";
import * as reltab from "reltab";
import { StateRef } from "oneref";
import { AppState } from "../AppState";

export interface ColumnSelectorProps {
  schema: reltab.Schema;
  viewParams: ViewParams;
  onColumnClick?: (cid: string) => void;
  stateRef: StateRef<AppState>;
}

const shortenTypeName = (tn: string): string => {
  return tn === "integer" ? "int" : tn;
};

export const ColumnSelector: React.FC<ColumnSelectorProps> = ({
  schema,
  viewParams,
  onColumnClick,
  stateRef,
}) => {
  const handleRowClick = (cid: string) => {
    if (onColumnClick) {
      onColumnClick(cid);
    }
  };

  const renderColumnRow = (cid: string) => {
    const displayName = schema.displayName(cid);
    const colTypeName = shortenTypeName(schema.columnType(cid).sqlTypeName);
    const isShown = viewParams.displayColumns.includes(cid);
    const isPivot = viewParams.vpivots.includes(cid);
    const isSort =
      viewParams.sortKey.findIndex((entry) => entry[0] === cid) !== -1;
    return (
      <tr key={cid}>
        <td className="col-colName" onClick={(e) => handleRowClick(cid)}>
          {displayName}
        </td>
        <td className="col-colType">{colTypeName}</td>
        <td className="col-check">
          <input
            className="colSel-check"
            type="checkbox"
            title="Show this column"
            onChange={() => actions.toggleShown(cid, stateRef)}
            checked={isShown}
          />
        </td>
        <td className="col-check">
          <input
            className="colSel-check"
            type="checkbox"
            title="Pivot by column"
            onChange={() => actions.togglePivot(cid, stateRef)}
            checked={isPivot}
          />
        </td>
        <td className="col-check">
          <input
            className="colSel-check"
            type="checkbox"
            title="Sort by column"
            onChange={() => actions.toggleSort(cid, stateRef)}
            checked={isSort}
          />
        </td>
      </tr>
    );
  };

  // render row with checkboxes to select / deselect all items:
  const renderAllRow = () => {
    const allShown = schema.columns.length === viewParams.displayColumns.length;
    const someShown = viewParams.displayColumns.length > 0;
    return (
      <tr className="all-row">
        <td className="col-colName-all">All Columns</td>
        <td className="col-colType" />
        <td className="col-check">
          <IndeterminateCheckbox
            className="colSel-check"
            type="checkbox"
            title="Show all columns"
            /* ref={"showCheckbox-all"} */
            onChange={() => actions.toggleAllShown(stateRef)}
            checked={allShown}
            indeterminate={!allShown && someShown}
          />
        </td>
        <td className="col-check" />
        <td className="col-check" />
      </tr>
    );
  };

  const columnIds = schema.columns.slice();
  columnIds.sort((cid1, cid2) =>
    schema.displayName(cid1).localeCompare(schema.displayName(cid2))
  );
  const allRow = renderAllRow();
  const columnRows = columnIds.map((cid) => renderColumnRow(cid));
  return (
    <div className="column-selector">
      <div className="column-selector-header">
        <table className="table table-condensed bp3-interactive column-selector-table">
          <thead>
            <tr>
              <th className="column-selector-th col-colName">Column</th>
              <th className="column-selector-th col-colType" />
              <th className="column-selector-th col-check">Show</th>
              <th className="column-selector-th col-check">Pivot</th>
              <th className="column-selector-th col-check">Sort</th>
            </tr>
          </thead>
          <tbody>{allRow}</tbody>
        </table>
      </div>
      <div className="column-selector-body">
        <table className="table table-condensed table-hover column-selector-table">
          <tbody>{columnRows}</tbody>
        </table>
      </div>
    </div>
  );
};
