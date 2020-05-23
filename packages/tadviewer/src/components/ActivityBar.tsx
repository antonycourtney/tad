/**
 *  Left-most fixed nav bar on application pane
 */

import * as React from "react";
import { StateRef } from "oneref";
import { AppState } from "../AppState";
import { Button } from "@blueprintjs/core";

export interface ActivityBarProps {
  onPivotPropsClick?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
  stateRef: StateRef<AppState>;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  onPivotPropsClick,
  stateRef,
}) => {
  return (
    <div className={"activityBar"}>
      <button
        type="button"
        className="bp3-button bp3-minimal bp3-icon-database"
      />
      <button type="button" className="bp3-button bp3-minimal bp3-icon-build" />
      <button
        type="button"
        className="bp3-button bp3-minimal bp3-icon-pivot-table"
        onClick={onPivotPropsClick}
      />
      <button type="button" className="bp3-button bp3-minimal bp3-icon-cog" />
    </div>
  );
};
