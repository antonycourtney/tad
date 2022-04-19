/**
 *  Left-most fixed nav bar on application pane
 */

import * as React from "react";
import { StateRef } from "oneref";
import { AppState } from "../AppState";
import { Button } from "@blueprintjs/core";
import { Activity } from "./defs";
import * as actions from "../actions";

export interface ActivityBarProps {
  activity: Activity;
  stateRef: StateRef<AppState>;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activity,
  stateRef,
}) => {
  const handleActivityClick =
    (buttonActivity: Activity) =>
    (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      if (activity === buttonActivity) {
        actions.setActivity("None", stateRef);
      } else {
        actions.setActivity(buttonActivity, stateRef);
      }
    };
  const baseStyle = "bp3-button bp3-minimal";
  const activeStyle = (target: Activity): string =>
    activity === target ? "bp3-active" : "";

  const activityButton = (target: Activity, iconName: string): JSX.Element => (
    <button
      type="button"
      className={[baseStyle, activeStyle(target), "bp3-icon-" + iconName].join(
        " "
      )}
      onClick={handleActivityClick(target)}
    />
  );

  return (
    <div className={"activityBar"}>
      {activityButton("DataSource", "database")}
      {/* activityButton("Query", "build") */}
      {activityButton("Pivot", "pivot-table")}
      {/* activityButton("Preferences", "cog") */}
    </div>
  );
};
