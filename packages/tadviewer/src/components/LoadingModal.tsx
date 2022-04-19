/*
 * A modal overlay to show the loading indicator
 */
import * as React from "react";
import { Spinner, Intent } from "@blueprintjs/core";
import { INTENT_PRIMARY } from "@blueprintjs/core/lib/esm/common/classes";

/*
        <div className="modal-container">

          <div className="modal-body-container">
            <span className="loading-indicator">
              <label>Loading...</label>
            </span>
*/
export class LoadingModal extends React.Component {
  render() {
    return (
      <div className="modal-overlay">
        <div className="loading-modal-container">
            <Spinner className="loading-spinner" intent={Intent.PRIMARY} />
        </div>
      </div>
    );
  }
}
