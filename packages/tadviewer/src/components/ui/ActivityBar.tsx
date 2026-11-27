/*
 * The new UI's activity bar: switches the sidebar between Data sources and
 * View settings. Clicking the active button hides the sidebar.
 */
import * as React from "react";
import { StateRef } from "oneref";
import * as actions from "../../actions";
import { AppState } from "../../AppState";
import { Activity } from "../defs";
import "./ui.css";

/* The mock-up's icons: a database, and a table (for the view's settings). */
const icon = (children: React.ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const DATABASE = icon(
  <>
    <ellipse cx="8" cy="3.75" rx="5" ry="1.75" />
    <path d="M3 3.75v8.5c0 .97 2.24 1.75 5 1.75s5-.78 5-1.75v-8.5" />
    <path d="M3 8c0 .97 2.24 1.75 5 1.75S13 8.97 13 8" />
  </>
);

const VIEW = icon(
  <>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
    <path d="M2.5 6.5h11M6.5 6.5v7" />
  </>
);

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
        ? button("DataSource", "Data sources", DATABASE)
        : null}
      {button("Pivot", "View settings", VIEW)}
    </nav>
  );
};
