# DOM grid: TODO and plan

`DomDataGrid` (TanStack Virtual, styled after the DuckDB UI) became the default grid on master on 2026-11-26. The goal is parity with the SlickGrid grid plus some polish. After that, a tadviewer major release can drop SlickGrid and Glide.

**How the work is done:** small commits straight to master. Each one is checked first:

- build, then the unit tests
- the UI tests on the DOM grid
- the shared UI tests on Glide, while Glide exists
- screenshots, for styling changes

CI builds every push to master. Bugs get a regression test where one is practical.

## 1. CI runs the tests

- [x] Run the unit tests on Linux, Windows and macOS: `reltab`, `aggtree`, `reltab-sqlite`, `reltab-duckdb` and `tadviewer`. `reltab-fs` has none, and the cloud drivers need credentials.
- [x] Run the UI tests on Linux (under a virtual display) and on Windows:
  - publish JUnit results to the Azure Tests tab
  - keep failure screenshots as a pipeline artifact
- [x] Get both green. The first run passed: 10 UI tests on Linux and 9 on Windows. One Windows test was flaky: deleting the test's profile folder failed with `EBUSY` while Electron still held a file. The cleanup now retries.

## 2. Bugs

- [x] **Wheel scrolling cuts off the top row.** After scrolling down and back to the top with a mouse wheel, the top row is cut off. Using the scrollbar doesn't do it. (Reported 2026-11-26.)
  - Fixed: the rows only moved when TanStack re-rendered, which it does only when the range of rows changes. Small wheel steps were therefore lost, and scrolling moved in whole-row jumps. The offset is now applied on every scroll.
- [x] **Some column widths are too narrow.** Examples: a cut-off "order…" header once it's sorted, and cut-off pivot totals ("4,999,950,0…").
  - Widths are measured on a canvas, which can't use `-apple-system`, so it measures in a different font from the one shown.
  - The canvas also ignores tabular digits (`tnum`).
  - Fixed: the grid now renders in the bundled Inter, which the canvas can use once it has loaded, so widths are measured again then. Digits are measured as tabular. A UI test checks that no cell or header is cut off.
- [x] **Columns sized while blank stay narrow.** For example, `note` in a collapsed pivot shows "Order not…" once rows are expanded. SlickGrid has the same problem.
  - Fixed: a column measured with no values is measured again as rows load. It can only get wider, so columns don't jump around.

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
- [x] Auto-scroll while drag-selecting past the edge of the grid. It scrolls faster the further past the edge the pointer is. UI tests cover downwards and rightwards.
- [x] Clicking a link in a cell opens it, through `onGridClick` and `openURL`. A UI test now covers it, with `shell.openExternal` stubbed.
- [x] Brushing a histogram filters the table. A UI test now covers it.
- [x] Check the web app (`tadweb-app` + `tadweb-server`) in a browser. The grid works there with Inter loaded and nothing cut off. Pre-existing bug, not caused by the grid: the web app's footer sits below the bottom of the window, and SlickGrid shows the same.

## 4. Styling

- [x] **Bundle the Inter font** (SIL Open Font License), so the grid looks the same on every platform and width measurement matches. This needs Inter's `tnum`/`zero`/`ss01`/`ss02` features to survive.
  - Done. Latin uses `inter-ui` (Inter 4.1, with every feature). The Google Fonts build (`@fontsource-variable/inter`), which lacks `zero`/`ss01`/`ss02`, covers Latin Extended and italic. The fonts are inlined in tadviewer's bundle (+320 KB).
- [x] **Histograms:** the axis labels are clipped. Restyle them to match the grid.
  - Done. The chart is drawn at the cell's pixel size, in the grid's font and colours: bars plus min/max labels, with no y axis. The brush outline only shows when part of the range is selected.
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
- 2026-11-26: CI runs the unit tests on all platforms and the UI tests on Linux and Windows (`8206896`).
- 2026-11-26: fixed wheel scrolling (lost small steps, top row cut off).
- 2026-11-26: bundled Inter; fixed column widths (font mismatch, tabular digits, columns that were blank).
- 2026-11-26: auto-scroll while drag-selecting.
- 2026-11-26: restyled the histograms; checked the web app; CI test fix for Windows.
