/*
 * A modal overlay to show the loading indicator
 */
import * as React from "react";
import { Spinner, Intent } from "@blueprintjs/core";
import { INTENT_PRIMARY } from "@blueprintjs/core/lib/esm/common/classes";

export interface LoadingModalProps {
  embedded: boolean;
}

export function LoadingModal({ embedded }: LoadingModalProps) {
  const spinner = embedded ? null : (
    <Spinner className="loading-spinner" intent={Intent.PRIMARY} />
  );
  return (
    <div className="loading-modal-overlay">
      <div className="loading-modal-container">{spinner}</div>
    </div>
  );
}
