import * as React from "react";
import * as actions from "../actions";

export interface SidebarProps {
  expanded: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ expanded, children }) => {
  const expandClass = expanded ? "sidebar-expanded" : "sidebar-collapsed";
  return (
    <div className={"sidebar " + expandClass}>
      <div className="sidebar-content">
        <div className="sidebar-content-inner">{children}</div>
      </div>
    </div>
  );
};
