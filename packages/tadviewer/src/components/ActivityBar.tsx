/**
 *  Left-most fixed nav bar on application pane
 */

import * as React from "react";
import { StateRef } from "oneref";
import { AppState } from "../AppState";
import { Button } from "@blueprintjs/core";
import { Activity } from "./defs";

export interface ActivityBarProps {
  activity: Activity;
  setActivity: (next: Activity) => void;
  stateRef: StateRef<AppState>;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activity,
  setActivity,
  stateRef,
}) => {
  const handleActivityClick = (buttonActivity: Activity) => (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    if (activity === buttonActivity) {
      setActivity("None");
    } else {
      setActivity(buttonActivity);
    }
  };
  return (
    <div className={"activityBar"}>
      <button
        type="button"
        className="bp3-button bp3-minimal bp3-icon-database"
        onClick={handleActivityClick("DataSource")}
      />
      <button
        type="button"
        className="bp3-button bp3-minimal bp3-icon-build"
        onClick={handleActivityClick("Query")}
      />
      <button
        type="button"
        className="bp3-button bp3-minimal bp3-icon-pivot-table"
        onClick={handleActivityClick("Pivot")}
      />
      <button
        type="button"
        className="bp3-button bp3-minimal bp3-icon-cog"
        onClick={handleActivityClick("Preferences")}
      />
    </div>
  );
};
