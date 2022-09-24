/**
 *  Left-most fixed nav bar on application pane
 */

import * as React from "react";
import { StateRef } from "oneref";
import { AppState } from "../AppState";
import { Button } from "@blueprintjs/core";
import { Activity } from "./defs";
import * as actions from "../actions";
import { BlueprintIcons_16Id } from "@blueprintjs/icons/lib/esm/generated/16px/blueprint-icons-16";

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
    (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
      if (activity === buttonActivity) {
        actions.setActivity("None", stateRef);
      } else {
        actions.setActivity(buttonActivity, stateRef);
      }
    };

  const activityButton = (
    target: Activity,
    iconName: BlueprintIcons_16Id
  ): JSX.Element => (
    <Button
      icon={iconName}
      minimal={true}
      active={activity === target}
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
