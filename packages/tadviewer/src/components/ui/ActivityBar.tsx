/*
 * The new UI's activity bar: switches the sidebar between Data sources and
 * View settings. Clicking the active button hides the sidebar.
 */
import * as React from "react";
import { StateRef } from "oneref";
import * as actions from "../../actions";
import { AppState } from "../../AppState";
import { Activity } from "../defs";
import { Database, SlidersHorizontal } from "./icons";
import "./ui.css";

export interface ActivityBarProps {
  activity: Activity;
  showDataSources: boolean;
  stateRef: StateRef<AppState>;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activity,
  showDataSources,
  stateRef,
}) => {
  const button = (target: Activity, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      className="tui-activity"
      aria-label={label}
      aria-pressed={activity === target}
      title={label}
      onClick={() => actions.setActivity(activity === target ? "None" : target, stateRef)}
    >
      {icon}
    </button>
  );
  return (
    <nav className="activityBar tad-ui tui-activitybar" aria-label="Sidebar">
      {showDataSources
        ? button("DataSource", "Data sources", <Database size={18} strokeWidth={1.6} />)
        : null}
      {button("Pivot", "View settings", <SlidersHorizontal size={18} strokeWidth={1.6} />)}
    </nav>
  );
};
