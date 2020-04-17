import * as React from "react";
import { ColumnList } from "./ColumnList";
import { ColumnListType } from "./constants";
export class DisplayOrderPanel extends React.Component {
  render() {
    const { viewParams, stateRefUpdater } = this.props;
    return (
      <div className="ui-block">
        <h6>
          Displayed Columns{" "}
          <small className="ui-subtext">(drag to reorder)</small>
        </h6>
        <ColumnList
          schema={this.props.baseSchema}
          columnListType={ColumnListType.DISPLAY}
          items={viewParams.displayColumns}
          stateRefUpdater={stateRefUpdater}
        />
      </div>
    );
  }
}
