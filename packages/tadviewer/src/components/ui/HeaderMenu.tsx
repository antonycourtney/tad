/*
 * A column header's menu (its ▾ button, or right-click): sort, pivot,
 * filter, format, aggregation, hide. The grid (DomDataGrid) owns the menu's
 * root and trigger; this is the menu itself.
 */
import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { StateRef } from "oneref";
import { AggFn, aggFns } from "reltab";
import * as actions from "../../actions";
import { AppState } from "../../AppState";
import { requestColumnFilter } from "../../uiEvents";
import { ViewState } from "../../ViewState";
import { HeaderPanel } from "../DataGrid";
import { editableFormat, FormatEditor, loadedRows, sampleValues } from "./FormatEditor";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  EyeOff,
  ListFilter,
  ListTree,
  Paintbrush,
  Sigma,
  X,
} from "./icons";
import "./ui.css";

export interface HeaderMenuProps {
  column: string;
  viewState: ViewState;
  stateRef: StateRef<AppState>;
  /** Show a panel (see HeaderPanelContent) in place of the menu. */
  showPanel: (panel: HeaderPanel) => void;
}

const ICON = { size: 14, strokeWidth: 1.8 };

const Item: React.FC<{
  icon?: React.ReactNode;
  checked?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}> = ({ icon, checked, onSelect, children }) => (
  <DropdownMenu.Item className="tui-mi" onSelect={onSelect}>
    <span className="tui-mi-icon">{icon}</span>
    <span>{children}</span>
    {checked ? (
      <span className="tui-mi-check" aria-label="(current)">
        <Check size={13} strokeWidth={2} />
      </span>
    ) : null}
  </DropdownMenu.Item>
);

export const HeaderMenu: React.FC<HeaderMenuProps> = ({
  column,
  viewState,
  stateRef,
  showPanel,
}) => {
  const { viewParams, baseSchema: schema } = viewState;
  const sortKey = viewParams.sortKey;
  const sortIdx = sortKey.findIndex(([c]) => c === column);
  const sortAsc = sortIdx >= 0 ? sortKey[sortIdx][1] : null;
  const pivoted = viewParams.vpivots.includes(column);
  const ct = schema.columnType(column);
  const agg = viewParams.getAggFn(schema, column);
  const formattable = editableFormat({ column }, viewParams, schema) !== null;
  // Whether the chosen item opens something that takes the focus (so the
  // menu mustn't give it back to its button as it closes):
  const focusElsewhere = React.useRef(false);

  // Sorting by a column the view already sorts by changes its direction;
  // otherwise it replaces the sort (as clicking the header does).
  const sortBy = (asc: boolean) =>
    actions.setSortKey(
      sortIdx >= 0
        ? sortKey.map(([c, a]) => [c, c === column ? asc : a] as [string, boolean])
        : [[column, asc]],
      stateRef
    );

  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        className="tad-ui tui-menu"
        align="end"
        sideOffset={4}
        collisionPadding={8}
        aria-label={`${schema.displayName(column)} column`}
        onCloseAutoFocus={(e) => focusElsewhere.current && e.preventDefault()}
      >
        <Item icon={<ArrowUp {...ICON} />} checked={sortAsc === true} onSelect={() => sortBy(true)}>
          Sort ascending
        </Item>
        <Item
          icon={<ArrowDown {...ICON} />}
          checked={sortAsc === false}
          onSelect={() => sortBy(false)}
        >
          Sort descending
        </Item>
        {sortIdx >= 0 ? (
          <Item
            icon={<X {...ICON} />}
            onSelect={() =>
              actions.setSortKey(
                sortKey.filter(([c]) => c !== column),
                stateRef
              )
            }
          >
            Clear sort
          </Item>
        ) : null}
        <DropdownMenu.Separator className="tui-sep" />
        <Item icon={<ListTree {...ICON} />} onSelect={() => actions.togglePivot(column, stateRef)}>
          {pivoted ? "Remove from pivot" : "Pivot by this column"}
        </Item>
        <Item
          icon={<ListFilter {...ICON} />}
          onSelect={() => {
            focusElsewhere.current = true;
            requestColumnFilter(column);
          }}
        >
          Filter…
        </Item>
        {formattable ? (
          <Item
            icon={<Paintbrush {...ICON} />}
            onSelect={() => {
              focusElsewhere.current = true;
              showPanel("format");
            }}
          >
            Format…
          </Item>
        ) : null}
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger className="tui-mi">
            <span className="tui-mi-icon">
              <Sigma {...ICON} />
            </span>
            <span>Aggregation</span>
            <span className="tui-mi-aside">{agg === "null" ? "none" : agg}</span>
            <ChevronRight size={12} strokeWidth={1.8} className="tui-dim" />
          </DropdownMenu.SubTrigger>
          <DropdownMenu.Portal>
            <DropdownMenu.SubContent
              className="tad-ui tui-menu tui-submenu"
              sideOffset={4}
              collisionPadding={8}
            >
              <DropdownMenu.Label className="tui-menu-label">
                Pivot rows and totals show the
              </DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                value={agg}
                onValueChange={(v) => actions.setAggFn(column, v as AggFn, stateRef)}
              >
                {aggFns(ct).map((fn) => (
                  <DropdownMenu.RadioItem key={fn} value={fn} className="tui-mi">
                    <span className="tui-mi-icon">
                      <DropdownMenu.ItemIndicator>
                        <Check size={13} strokeWidth={2} />
                      </DropdownMenu.ItemIndicator>
                    </span>
                    <span>{fn === "null" ? "none" : fn}</span>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.SubContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Sub>
        <DropdownMenu.Separator className="tui-sep" />
        <Item icon={<EyeOff {...ICON} />} onSelect={() => actions.toggleShown(column, stateRef)}>
          Hide column
        </Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
};

/** A header menu's panel ("format": the column's format editor). */
export const HeaderPanelContent: React.FC<{
  column: string;
  panel: HeaderPanel;
  viewState: ViewState;
  stateRef: StateRef<AppState>;
  onClose: () => void;
}> = ({ column, panel, viewState, stateRef, onClose }) => {
  if (panel !== "format") {
    return null;
  }
  return (
    <FormatEditor
      target={{ column }}
      viewParams={viewState.viewParams}
      schema={viewState.baseSchema}
      stateRef={stateRef}
      samples={sampleValues(loadedRows(viewState), column)}
      onClose={onClose}
    />
  );
};
