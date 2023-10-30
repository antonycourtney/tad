import * as React from "react";
import * as reltab from "reltab";
import * as actions from "../actions";
import { FilterEditor } from "./FilterEditor";
import { AppState } from "../AppState";
import { ViewState } from "../ViewState";
import { StateRef } from "oneref";
import { useState } from "react";
import { getDefaultDialect } from "reltab";

export interface FooterProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
}

export const Footer: React.FunctionComponent<FooterProps> = (
  props: FooterProps
) => {
  const { appState, stateRef, rightFooterSlot = null } = props;
  const [expanded, setExpanded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [prevFilter, setPrevFilter] = useState<reltab.FilterExp | null>(null);

  // console.log("Footer: ", appState.toJS());

  const viewState = appState.viewState;

  const setExpandedState = (nextState: boolean) => {
    if (nextState && !dirty) {
      // snap current filter into prevFilter:
      setExpanded(nextState);
      setPrevFilter(viewState.viewParams.filterExp);
      setDirty(true);
    } else {
      setExpanded(nextState);
    }
  };

  const handleFilterButtonClicked = (event: any) => {
    event.preventDefault();
    const nextState = !expanded;
    setExpandedState(nextState);
  };

  const handleFilterCancel = () => {
    // restore previous filter:
    const fe = prevFilter || new reltab.FilterExp();
    actions.setFilter(fe, stateRef);
    setExpandedState(false);
    setDirty(false);
    setPrevFilter(null);
  };

  const handleFilterApply = (filterExp: reltab.FilterExp) => {
    actions.setFilter(filterExp, stateRef);
  };

  const handleFilterDone = () => {
    setExpandedState(false);
    setDirty(false);
    setPrevFilter(null);
  };

  const filterExp = appState.viewState.viewParams.filterExp;
  const filterStr = filterExp.toSqlWhere(getDefaultDialect());

  const expandClass = expanded ? "footer-expanded" : "footer-collapsed";

  const editorComponent = expanded ? (
    <FilterEditor
      appState={appState}
      stateRef={stateRef}
      schema={viewState.baseSchema}
      filterExp={filterExp}
      onCancel={handleFilterCancel}
      onApply={handleFilterApply}
      onDone={handleFilterDone}
    />
  ) : null;

  let rowCountBlock = null;
  const queryView = appState.viewState.queryView;
  if (queryView) {
    const numFmt = (num: number) =>
      num.toLocaleString(undefined, { useGrouping: true });

    const { rowCount, baseRowCount, filterRowCount } = queryView;
    const rowCountStr = numFmt(rowCount);
    const rcParts = [rowCountStr];
    if (rowCount !== baseRowCount) {
      rcParts.push(" (");
      if (filterRowCount !== baseRowCount && filterRowCount !== rowCount) {
        const filterCountStr = numFmt(filterRowCount);
        rcParts.push(filterCountStr);
        rcParts.push(" Filtered, ");
      }
      rcParts.push(numFmt(baseRowCount));
      rcParts.push(" Total)");
    }
    const rcStr = rcParts.join("");
    rowCountBlock = (
      <div className="footer-block">
        <span className="footer-value">
          {rcStr} Row{rowCount === 1 ? "" : "s"}
        </span>
      </div>
    );
  }
  return (
    <div className={"footer " + expandClass}>
      <div className="footer-top-row">
        <div className="footer-filter-block">
          <a onClick={(event) => handleFilterButtonClicked(event)} tabIndex={0}>
            Filter
          </a>
          <span className="filter-summary"> {filterStr}</span>
        </div>
        <div className="footer-right-block">
          {rowCountBlock}
          {rightFooterSlot}
        </div>
      </div>
      {editorComponent}
    </div>
  );
};
