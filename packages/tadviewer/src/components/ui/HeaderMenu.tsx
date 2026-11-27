/*
 * A column header's menu (its ▾ button, or right-click): sort, pivot,
 * filter, format, aggregation, hide. The grid (DomDataGrid) owns the menu's
 * root and trigger; this is the menu itself.
 */
import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { StateRef } from "oneref";
import { AggFn } from "reltab";
import * as actions from "../../actions";
import { AppState } from "../../AppState";
import { filteredColumns } from "../../filterChips";
import { requestColumnFilter } from "../../uiEvents";
import { ViewState } from "../../ViewState";
import { HeaderPanel } from "../DataGrid";
import {
  editableFormat,
  formatSummary,
  FormatEditor,
  loadedRows,
  sampleValues,
} from "./FormatEditor";
import {
  FilterGlyph,
  FormatGlyph,
  HideGlyph,
  PivotGlyph,
  SortDownGlyph,
  SortUpGlyph,
  TickGlyph,
} from "./glyphs";
import { typeIcon } from "./typeIcon";
import { aggChoices, aggLabel } from "./ViewSidebar";
import "./ui.css";

export interface HeaderMenuProps {
  column: string;
  viewState: ViewState;
  stateRef: StateRef<AppState>;
  /** Show a panel (see HeaderPanelContent) in place of the menu. */
  showPanel: (panel: HeaderPanel) => void;
}

const Item: React.FC<{
  icon?: React.ReactNode;
  checked?: boolean;
  aside?: string;
  onSelect: () => void;
  children: React.ReactNode;
}> = ({ icon, checked, aside, onSelect, children }) => (
  <DropdownMenu.Item className="tui-mi" onSelect={onSelect}>
    <span className="tui-mi-icon">{icon}</span>
    <span>{children}</span>
    {aside ? <span className="tui-mi-aside">{aside}</span> : null}
    {checked ? (
      <span className="tui-mi-check" aria-label="(current)">
        <TickGlyph />
      </span>
    ) : null}
  </DropdownMenu.Item>
);

/** The menu, as in the mock-up: a title, then sort, pivot, filter, format, hide, and the aggregation. */
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
  const name = schema.displayName(column);
  const agg = viewParams.getAggFn(schema, column);
  const format = editableFormat({ column }, viewParams, schema);
  const ownFormat = viewParams.columnFormats.has(column);
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
        className="tad-ui tui-menu tui-colmenu"
        align="end"
        sideOffset={4}
        collisionPadding={8}
        aria-label={`${name} column`}
        onCloseAutoFocus={(e) => focusElsewhere.current && e.preventDefault()}
      >
        <DropdownMenu.Label className="tui-mtitle">
          <span className="tui-typeicon" aria-hidden="true">
            {typeIcon(ct.kind)}
          </span>
          <span className="tui-mtitle-name">{name}</span>
          <span className="tui-mtitle-type">{ct.sqlTypeName.toUpperCase()}</span>
        </DropdownMenu.Label>
        <Item icon={<SortUpGlyph />} checked={sortAsc === true} onSelect={() => sortBy(true)}>
          Sort ascending
        </Item>
        <Item icon={<SortDownGlyph />} checked={sortAsc === false} onSelect={() => sortBy(false)}>
          Sort descending
        </Item>
        {sortIdx >= 0 ? (
          <Item
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
        <Item icon={<PivotGlyph />} onSelect={() => actions.togglePivot(column, stateRef)}>
          {pivoted ? "Remove from pivot" : `Pivot by ${name}`}
        </Item>
        <Item
          icon={<FilterGlyph />}
          onSelect={() => {
            focusElsewhere.current = true;
            requestColumnFilter(column);
          }}
        >
          {filteredColumns(viewParams.filterExp, schema).includes(column)
            ? "Edit filter…"
            : "Filter…"}
        </Item>
        {format ? (
          <Item
            icon={<FormatGlyph />}
            aside={ownFormat ? formatSummary(format) : "Default"}
            onSelect={() => {
              focusElsewhere.current = true;
              showPanel("format");
            }}
          >
            Format…
          </Item>
        ) : null}
        <Item icon={<HideGlyph />} onSelect={() => actions.toggleShown(column, stateRef)}>
          Hide column
        </Item>
        <DropdownMenu.Separator className="tui-sep" />
        <DropdownMenu.Group className="tui-mgroup">
          <DropdownMenu.Label className="tui-mgroup-label">In pivot rows, show</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            className="tui-seg tui-wrap"
            value={agg}
            onValueChange={(v) => actions.setAggFn(column, v as AggFn, stateRef)}
          >
            {aggChoices(ct).map((fn) => (
              <DropdownMenu.RadioItem
                key={fn}
                value={fn}
                className="tui-segb"
                // Picking one keeps the menu open, as in the mock-up:
                onSelect={(e) => e.preventDefault()}
              >
                {aggLabel(fn)}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Group>
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
