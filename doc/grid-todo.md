# DOM grid: TODO and plan

`DomDataGrid` (TanStack Virtual, styled after the DuckDB UI) became the default grid on master on 2026-11-26. The goal is parity with the SlickGrid grid plus some polish. After that, a tadviewer major release can drop SlickGrid and Glide.

**How the work is done:** small commits straight to master. Each one is checked first:

- build, then the unit tests
- the UI tests on the DOM grid
- the shared UI tests on Glide, while Glide exists
- screenshots, for styling changes

CI builds every push to master. Bugs get a regression test where one is practical.

## 1. CI runs the tests

- [ ] Run the unit tests on Linux, Windows and macOS: `reltab`, `aggtree`, `reltab-sqlite`, `reltab-duckdb` and `tadviewer`. `reltab-fs` has none, and the cloud drivers need credentials.
- [ ] Run the UI tests on Linux (under a virtual display) and on Windows:
  - publish JUnit results to the Azure Tests tab
  - keep failure screenshots as a pipeline artifact
- [ ] Get both green.

## 2. Bugs

- [ ] **Wheel scrolling cuts off the top row.** After scrolling down and back to the top with a mouse wheel, the top row is cut off. Using the scrollbar doesn't do it. (Reported 2026-11-26.)
- [ ] **Some column widths are too narrow.** Examples: a cut-off "order…" header once it's sorted, and cut-off pivot totals ("4,999,950,0…").
  - Widths are measured on a canvas, which can't use `-apple-system`, so it measures in a different font from the one shown.
  - The canvas also ignores tabular digits (`tnum`).
- [ ] **Columns sized while blank stay narrow.** For example, `note` in a collapsed pivot shows "Order not…" once rows are expanded. SlickGrid has the same problem.

## 3. Parity with SlickGrid

Already done, with UI tests:
- the frozen pivot column
- sorting, including multi-column with shift-click
- resizing and reordering columns
- range selection (drag and shift-click)
- copy as TSV, from Cmd/Ctrl-C and Edit > Copy
- column histograms
- tooltips on clipped cells and headers
- hidden columns
- paging of rows as you scroll
- the loading overlay

Keyboard navigation and tables of 10M+ rows go beyond what SlickGrid did.

To do:
- [ ] Auto-scroll while drag-selecting past the edge of the grid.
- [ ] Clicking a link in a cell opens it, through `onGridClick` and `openURL`. Add a UI test, stubbing `shell.openExternal`.
- [ ] Brushing a histogram filters the table. Add a UI test.
- [ ] Check the web app (`tadweb-app` + `tadweb-server`) in a browser.

## 4. Styling

- [ ] **Bundle the Inter font** (SIL Open Font License), so the grid looks the same on every platform and width measurement matches. This needs Inter's `tnum`/`zero`/`ss01`/`ss02` features to survive.
- [ ] **Histograms:** the axis labels are clipped. Restyle them to match the grid.
- [ ] **Footer:** use the grid's font, size and colours rather than 14px Helvetica on grey.
- [ ] **Rows still loading:** show a subtle placeholder instead of blank cells.
- [ ] **Frozen pivot column:** show an edge or shadow when the table is scrolled sideways.
- [ ] **Header:** add a hover state and show the resize handle on hover.
- [ ] **Speed:** re-run the scrolling comparison (`PERF=1`) after these changes.

## 5. Ideas: not started without a go-ahead

- A row-number column. The DuckDB UI has one; SlickGrid didn't.
- Double-click a column's resize handle to fit its contents.
- Remove SlickGrid and Glide and their dependencies. This is a release decision.
- Dark mode. The grid's CSS supports it, but the app doesn't.

## Log

- 2026-11-26: DOM grid made the default (`2891dd6`); `TAD_REMOTE_DEBUGGING_PORT` removed (#311).
