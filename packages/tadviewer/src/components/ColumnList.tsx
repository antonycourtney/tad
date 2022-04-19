import * as React from "react";
import {
  ColumnRowData,
  ColumnRow,
  ColumnRowFormatter,
  ColumnRowProps,
} from "./ColumnRow";
import { ColumnListType } from "./defs";
import * as reltab from "reltab";
import { StateRef } from "oneref";
import { AppState } from "../AppState";

/*
 * A simple ordered list of columns.  Supports re-ordering
 */

export interface ColumnListProps {
  columnListType: ColumnListType;
  schema: reltab.Schema;
  items: ColumnRowData[];
  headerLabels?: string[];
  rowFormatter?: ColumnRowFormatter;
  stateRef: StateRef<AppState>;
}

export const ColumnList: React.FC<ColumnListProps> = ({
  columnListType,
  schema,
  headerLabels,
  items,
  rowFormatter,
  stateRef,
}) => {
  const renderColumnRow = (row: ColumnRowData) => {
    let key: string = row as string;

    if (typeof row !== "string") {
      key = row[0];
    }

    return (
      <ColumnRow
        key={key}
        columnListType={columnListType}
        schema={schema}
        rowFormatter={rowFormatter}
        stateRef={stateRef}
        rowData={row}
      />
    );
  };

  let extraHeaders = null;

  if (headerLabels) {
    extraHeaders = headerLabels.map((hnm) => {
      return (
        <th key={hnm} className="column-list-th">
          {hnm}
        </th>
      );
    });
  }

  const columnRows = items.map((row) => renderColumnRow(row));
  return (
    <div className="column-list">
      <div className="column-list-header">
        <table className="table column-selector-table">
          <thead>
            <tr>
              <th className="column-list-th col-colName">Column</th>
              {extraHeaders}
            </tr>
          </thead>
        </table>
      </div>
      <div className="column-list-body">
        <table className="table table-hover column-selector-table">
          <tbody>{columnRows}</tbody>
        </table>
      </div>
    </div>
  );
};
