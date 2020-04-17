import * as React from "react";
import { ColumnRow } from "./ColumnRow";
/*
 * A simple ordered list of columns.  Supports re-ordering
 */

export class ColumnList extends React.Component {
  renderColumnRow(row: any) {
    let key = row;

    if (typeof row !== "string") {
      key = row[0];
    }

    return (
      <ColumnRow
        key={key}
        columnListType={this.props.columnListType}
        schema={this.props.schema}
        rowFormatter={this.props.rowFormatter}
        stateRefUpdater={this.props.stateRefUpdater}
        rowData={row}
      />
    );
  }

  render() {
    let extraHeaders = null;

    if (this.props.headerLabels) {
      extraHeaders = this.props.headerLabels.map(hnm => {
        return (
          <th key={hnm} className="column-list-th">
            {hnm}
          </th>
        );
      });
    }

    const columnRows = this.props.items.map(row => this.renderColumnRow(row));
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
  }
}
