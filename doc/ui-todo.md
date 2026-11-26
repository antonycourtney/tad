# View controls redesign: TODO and plan

This replaces the Blueprint UI around the grid with a new design:
- the sidebar's Order, Pivot, Sort, Aggregations and Format tabs
- the filter dialog
- the data sources panel

The design comes from a clickable mock-up reviewed on 2026-11-26 (a private artifact, not linked here). The aims:
- the data comes first: quiet, low-ink controls (Tufte)
- it stays fast to work with tables of many columns
- nothing the current UI can do is lost

**How the work is done:** as for the grid (`doc/grid-todo.md`).
- Small commits go straight to master.
- Each one is checked first: build, then the unit tests, then the UI tests. Styling changes also get screenshots.
- CI builds every push.
- The new UI sits behind a switch until it can do everything the old one can. Then the old one is removed.
- tadweb-app uses the same components, so each step is also checked in a browser.

## Design decisions

### Sidebar

- **Activity bar:** switches between Data sources and View settings. Clicking the active button hides the sidebar.
- **Pivot and Sort shelves** at the top replace the Order, Pivot and Sort tabs.
  - Each shows its columns as chips, in order. Drag a chip to reorder it, or click × to remove it.
  - A sort chip's direction button flips it between ascending and descending.
- **The column list** has one row per column, with a search box. A **Layout | Aggregation | Format** switch changes what each row shows.
  - **Layout** has Show, Pivot and Sort toggles.
    - Pivot shows the column's position in the pivot.
    - Sort cycles ascending → descending → off. It shows the column's position when sorting by more than one column.
    - An "All" row shows a three-state Show toggle (all, some, none).
    - Drag a row to change the column order.
  - **Aggregation** gives each column a menu of its type's options, including None. A choice that differs from the type's default shows in blue.
  - **Format** lists the Integer, Real and Text defaults at the top, each with a sample value.
    - Each column shows a value from its own data, in the format it will be shown in.
    - A dot marks a column with its own format.
    - Clicking a default or a column opens the format editor.
- **Format editor** (a popover):
  - A preview of sample values.
  - Method: Auto, Full or Custom. Custom adds a decimal-places stepper and a scientific-notation switch. The 1,000s separator switch shows where it applies. Text formats have "Show URLs as links".
  - A default's editor says how many columns use it.
  - A column with its own format gets "Reset to the Real default" (or Integer, or Text).
- **Options:** column histograms, totals as top row, and "Label leaf rows with" (today's Pivot Tree Leaf Level).
- **Toggles:** a ticked toggle is a pale blue tint with a dark blue mark, not solid blue.

### Header menu

Hover a column header for its ▾ button, or right-click the header. The menu has:
- sort ascending, sort descending, clear sort
- pivot by this column, or remove it from the pivot
- Filter… (opens the column's existing chip, or adds one)
- Format…
- Hide column
- the aggregation

### Filter bar

The filter bar replaces the dialog and lives in the footer.
- Each condition is a chip. An **All/Any** switch appears once there are two.
- **+ Filter** always adds a new chip, so a column can have several conditions (contains "a" *or* contains "b").
- The footer also has Clear all and the row count.
- **Text columns** offer **Pick values | Match text**.
  - **Pick values:** a ticked value's rows are kept. A new filter starts with every value ticked.
  - Unticking a few makes the filter "all but these" (`NOT IN`). Unticking All and then ticking a few makes it "only these" (`IN`). The chip shows which one it is.
  - The two differ when the data changes: a new value is kept by "all but" and dropped by "only these".
  - The list shows the N most common values, each with a row count that takes the other filters into account. It says how many values there are in total.
  - The search covers every value, not just the listed ones. Ticked or unticked exceptions are always listed.
  - While searching, "All matching "x"" ticks or unticks every match.
  - **Match text:** contains, starts with, ends with, and the "doesn't" form of each. Case is ignored. It previews the matching values and the number of rows that pass.
- **Number columns** offer is between, is not between, is NULL and is not NULL.
  - Pick a range by clicking one histogram bar and then another, or by typing a min and max.
  - Setting min and max to the same value gives = (or ≠ for "is not between").
- **NULLs:** positive conditions drop NULL rows by default. Negative ones ("doesn't …", "is not between", "all but") keep them.
  - An "Also keep rows with no value (NULL)" checkbox appears when the column has NULLs.
  - The chip only mentions NULLs when the default has been changed.
  - **Behaviour change:** today `NOT IN` and `NOT ILIKE` silently drop NULL rows.
- **Alphabetical <, ≤, >, ≥ on text columns** are no longer offered. A saved view that uses one shows it as a grey, read-only chip. The chip still filters, and it can be removed.
- **Changes apply as you make them.** The query runs about 300 ms after the last change. Esc in an open popover reverts the chip to how it was when the popover opened.
- **Brushing a header histogram** sets the column's number chip, adding one if needed.

### Data sources panel

- A search box ("Find a table or file") shows the matches together with the folders and schemas they're in.
- Each row in the tree has:
  - a chevron, for folders, schemas and databases
  - an icon for the kind of node
  - the name
  - for top-level sources, a dim note such as the engine name or the path
  - an info icon that shows the description, when the node has one
- The open table is highlighted. Clicking a table or file opens it, as now.

## Saved views and reltab

- **Chips are saved as the view's `FilterExp`.** The All/Any switch is its `op`, and each chip is one of its `opArgs`: either a single condition or a nested `FilterExp`.
  - "Only these" is saved as `IN`.
  - "All but" is saved as `NOT IN`, combined with `IS NULL` using OR when NULLs are kept.
  - Match text uses `BEGINS`, `ENDS` and `CONTAINS` and their `NOT` forms (which use `ILIKE`), with the same NULL handling.
  - A number range uses `GE` and `LE` (joined by AND). "Is not between" uses `LT` OR `GT`. Equal bounds become `EQ` or `NEQ`. `IS NULL` is added with OR when NULLs are kept.
  - Is NULL and is not NULL use `ISNULL` and `NOTNULL`.
  - "Only these" with nothing ticked needs a condition that is always false. `IN ()` isn't valid SQL.
- **Loading** turns these shapes back into chips; anything else becomes a read-only chip. In an AND filter from an older file, a `GE` and an `LE` on the same column become one range chip. A number `LT` or `GT` becomes an open-ended "is not between" range, and `= a OR = b` on a text column becomes a list of values.
- **Fix `FilterExp.deserialize`.** It reads every `opArg` as a single condition, so a nested filter wouldn't load back correctly. It needs a unit test for the full save-and-load round trip.
- **File version.** Files with nested filters can't be read by older versions of Tad, and older versions don't check the version number of a file before loading it.
  - Bump `VIEW_PARAMS_FORMAT_VERSION`, and `TAD_FILE_FORMAT_VERSION` in tad-app.
  - Add a clear "saved by a newer version of Tad" message now, so future versions can rely on it.
- **The value list's queries:**
  - The distinct values with their counts, under the other filters: `GROUP BY`, ordered by count, with a `LIMIT`.
  - The total number of distinct values. Use an approximate count on large tables where the engine has one (for example DuckDB's `approx_count_distinct`).
  - The search, using the same `ILIKE` as contains.
  - Check what these cost on large DuckDB, Snowflake and BigQuery tables. Today's editor fetches 50 distinct values, without counts.
- **Histogram brushing.** `setHistogramBrushFilter` currently removes every condition on the column and ignores brushes when the filter uses OR. Change it to update the column's number chip.

## Steps

### 1. Tests for today's behaviour

- [x] UI tests for the current sidebar and filter dialog. None exist today.
  - Sidebar: show and hide columns, pivot, sort, reorder, aggregations, formats (defaults and single columns), leaf level, the histograms switch, the totals row.
  - Filter dialog: each operator, AND and OR, Cancel, Apply.
  - The tests check what the grid shows, and reach the controls through a driver with one implementation for the old UI and one for the new, as `grid-driver.ts` does for the grids. Most of the tests then carry over to the new UI unchanged.
- [x] reltab unit tests for the filter SQL: `NOT IN`, `NOT ILIKE`, nested filters, and saving then loading a filter.

### 2. Foundations

- [x] reltab: fix `FilterExp.deserialize` for nested filters, and handle the file version (see above).
- [x] A small component set: Radix primitives (popover, dropdown and context menus, select, switch, checkbox, tooltip, dialog), styled in plain CSS on the grid's colour tokens, with Lucide icons and dnd-kit for dragging. Record the bundle size before and after.
  - Each Radix primitive is its own package (`@radix-ui/react-popover` so far); add the others as they're used. Lucide icons are imported one at a time, through `components/ui/icons.ts`: tadviewer compiles to CommonJS, so importing from `lucide-react` bundled every icon (+1 MB).
  - The styles are in `components/ui/ui.css` (`tui-` classes, under `.tad-ui`).
  - `tadapp.bundle.js`: 5,452,377 bytes (1,729,194 gzipped) before; 5,608,899 (1,768,945 gzipped) with the filter bar and the popover, so +157 KB (+40 KB gzipped).
- [x] A switch between the old and new UI, like `GRID_IMPL` for the grids: `TAD_UI=new` (or `localStorage.tadUI`), in `uiImpl.ts`. The UI tests take `TAD_UI` too; CI (Linux) runs the new UI's tests as well.

### 3. Filter bar

- [x] Converting between chips and `FilterExp`: pure functions with unit tests, including filters from older files (`filterChips.ts`).
- [x] Chips for text (pick values and match text) and numbers, NULL handling, read-only chips, All/Any, + Filter, Clear all (`components/ui/FilterBar.tsx`, `ChipEditor.tsx`).
- [x] The value list's queries, with the cap (`filterQueries.ts`; 200 values).
- [x] Applying changes as they're made, the delay before querying, and Esc to revert.
- [x] Histogram brushing sets the column's chip.
- [x] UI tests for each of these, and screenshots: the filter tests in `view-controls.e2e.ts` run against both UIs (`e2e/new-ui-controls.ts`), plus `filter-bar.e2e.ts`; screenshots with `SCREENSHOTS=1 TAD_UI=new`.

### 4. Header menu

- [ ] The ▾ button and right-click menu, with its sort, pivot, filter, format, hide and aggregation items.

### 5. Sidebar

- [ ] Pivot and Sort shelves, with dragging.
- [ ] The column list: search, and the Layout, Aggregation and Format modes.
- [ ] The format editor.
- [ ] The Options section, including the leaf label.
- [ ] Dragging works from the keyboard too (dnd-kit supports this).

### 6. Data sources panel

- [ ] The tree, the search, the descriptions, and the highlighted open table.

### 7. The remaining Blueprint UI

- [ ] The Export dialogs, the dialog asking whether to replace the current view, the loading modal and the delayed-calculation footer.
- [ ] The `Icon` and `Tooltip` that `DomDataGrid` still uses.

### 8. Remove the old UI

- [ ] Remove Blueprint (core, popover2, icons), react-dnd, the Less styles, normalize.css, the old components and the switch.
- [ ] Release notes: the NULL behaviour change, and that alphabetical comparisons on text are now read-only.

## Open questions

- How many values should the value list show? Probably a few hundred.
- Is Esc to revert enough, or is an explicit Cancel still needed? Decide after trying it on a large table.

## Questions to revisit

Choices made while working on this alone, to check:

- The file versions are now 4, before anything writes a nested filter. Files saved from now on say version 4, which older versions of Tad don't check.
- A file from a newer version of Tad still opens, after a warning that some settings may not load. Should it refuse instead?
- Quitting Tad while a DuckDB query ran crashed it (or hung it, for a long query). Tad now interrupts running queries when quitting. The web app's server (tadweb-server) may need the same on shutdown; not done.
- The old filter dialog's All/Any select doesn't show the saved choice. Not fixed, as the dialog is being replaced.
- The old Columns table lists columns alphabetically; the new column list follows the display order. Is a sort-by-name option wanted?
- Should the switch default to the new UI as soon as it does everything the old one does, or after a release with both?
- The value list compares values as text: a date or boolean column's values are cast to VARCHAR, and the filter's `IN` list matches them as text. This works in DuckDB; other engines are untested.
- Text matching uses `ILIKE` without escaping `%` and `_` (as the old dialog did), so searching for "50%" also matches "500". Escape them in reltab?
- The value list's total ("Search 5 values") is an exact count of distinct values, not an approximate one. Check what it costs on large tables, and on Snowflake and BigQuery.
- A chip that keeps every row (for example a new chip, before you change it) isn't part of the saved filter. It disappears when the view is reopened, and also when a histogram brush changes the filter.
- Brushing an integer column's histogram keeps the whole numbers in the brushed range (so a brush from 7.6 to 11.4 keeps 8 to 11).
- Esc reverts; clicking outside the popover (or its ×) keeps the change. There's no Cancel button.

## Ideas: not started without a go-ahead

- A Cmd-K command palette (jump to a column, run any action).
- Dark mode. The new CSS uses the grid's colour tokens, so it would be possible.

## Log

- 2026-11-26: mock-up reviewed; plan written.
- 2026-11-26: step 1 done: reltab filter tests, and UI tests for the sidebar and filter dialog (`e2e/view-controls.e2e.ts`, through `ViewControls`, with a Blueprint driver). Fixed loading nested filters and empty `IN` lists. The new tests showed Tad crashing when quitting during a query; fixed (reltab-duckdb `finishPendingWork`). File versions bumped to 4, with a warning for files from newer versions.
- 2026-11-26: steps 2 and 3 done: the filter bar, behind `TAD_UI=new`. It replaces the footer, so the row counts moved into it ("N of T rows"; "N rows, from F of T" when pivoted).
