# Tad-pkg implementation notes

## lerna bootstrap not working

Unfortunately running `lerna bootstrap` doesn't seem to be working with our local fork of node-sqlite3; perhaps it
doesn't understand `git` URLs in dependencies in `package.json`?

```sh
$ npm install --build-from-source
```

in the `reltab-sqlite` package (to ensure a source build of the fork of `node-sqlite` ).

## Package Structure

The repository is organized into the following packages, found in the `packages` directory:

- **reltab** - portable, fluent API for query composition and SQL generation
- **reltab-sqlite** - SQLite driver for reltab
- **aggtree** - Pivot tree table built on top of reltab
- **tadviewer** - Tad UI React component library (embeddable in web server or Electron app)
- **tadapp** - Electron app wrapper

Migration strategy: Let's get the Electron app working again, and in TypeScript, then think about
refactoring.

- **reltab-electron-remote** - Reltab client and server between Electron renderer and app
  Then:
- **tadweb-app** - WebSocket client for reltab, based on reltab-remote for Electron app
- **tadweb-server** - Node.js / Express based server, derived from electron app / renderer separation

Should finish porting over the reltab-sqlite tests Jest. This will be key to ensuring things don't break.
Then we should do:

- **reltab-postgres** - Postgres driver for reltab
- **reltab-bigquery** - Google BigQuery driver for reltab

Then should think about making Tad a more full-fledged database pivot table. Want two key UI enhancements:

- Table Browser
- Multiple Tabs
  and look into doing a Node.js / Express server for Tad.

# Migration Notes

### Punch-list items:

[X] Think about binding affinity of dialect for WebConnection. Probably want dialect to live on Schema.
[X] Floating point / real formatting (num decimal places) not working on BigQuery data (Iowa liquor db). Why?
[X] Crash bug when setting formatting for specific column by column name
[ ] \*\*\* Must be able to give a sqlite file to tad-app command line without specifying table name!
[ ] defer gray loading overlay to avoid flicker when switching tables
[ ] Really need better feedback that data is loading when scrolling!
[ ] We choke in BigQuery when pivoting by an INT64 column (like ParentID in Hacker News dataset). Probably add an 'asString' option to mapColumns
[X] DataSource support for sqlite
[ ] Add assertive test using a sqlite db file (not a csv) as data source
[ ] Optimize SQL construction a bit -- a sequence of projects currently looks very sub-optimal, as do multiple extends. Look at bigquery opps with sorted aggtree.
[X] JavaScript representation of QueryExp AST for debugging
[X] How do we go from column type back to a Core Type for formatting? Example: int/float formatting panel. Ans: ColumnKind
[X] Tweak extend to make column type optional, with clear rules for inference. number ==> integer by default.
[ ] Change internal and exported signatures of Schema to reflect that not all string lookups will succeed.
[ ] Change dialects from singletons to static objects that implement SQLDialect interface
[ ] Get rid of hard-coded testTable and testBaseUrl in webRenderMain
[ ] Migrate aggtree tests
[ ] Fix clipboard write (electron based) in GridPane.tsx
[ ] Verify that new browser-friendly export-to-csv lib works
[ ] getTableInfo should probably move in to reltab.Connection
[ ] Fix remoteErrorDialog in PivotRequests
[ ] Decide what we're doing about whether DataView should ever be null in ViewState
[ ] Validate that we can change decimal places in different columns; comment in NumFormatPanel suggests panel
can be re-used in strange ways.
[ ] Deal gracefully with network errors
[ ] Electron app: port various event handlers from renderMain to web app
[ ] Electron app: Deal with 'tadopenexternal' (TextFormatOptions.ts) to open external links from electron app in web app
[X] \*\*\* !! Migrate reltab AST to use typescript tagged unions (kill tableArgs / valArgs)
[ ] Need to account for constant expressions (numbers and string literals) vs column references coming from an extend
operation that can end up in a SQL select column expression. Probably time for a tagged union!
[ ] static analysis of tables mentioned in a query
[ ] Add static validation of JSON data in tadweb-server, using https://github.com/pelotom/runtypes

### Features to add before next release:

[X] Multiple database support (at least bigquery)
[ ] Critical bug: Can't enter non-integral values for floats. Try imdb_score > 8.5 in movie_metadata
[ ] Bug: Seemed to get a crash when filling in a value in filter in "Contains..." for string column (quoting issue)
[ ] Delayed calc mode
[ ] Datasets and table selector UI
[ ] column extensions
[ ] Font size preferences
[ ] Include query time in footer
[ ] Query console showing generated queries
[ ] date and time columns
[ ] Web server running publicly
[ ] horizontal pivots
[ ] heat maps
[ ] spark lines
[ ] Save views to view store in tadweb-server
[ ] Views loadable by URL
[ ] Open to Depth
[ ] Duplicate detection / elimination. Constructing the groupBy using schema an interesting example
of reltab.

### What to ship for Memorial Day week:

A web service that allows creation and sharing of named pivot tables (maybe workbooks).

Priorities:
[ ] Presto support
[ ] Sandbox-like UI for creating an analysis, saving/loading session, assigning name, sharing URL
[ ] Deferred Recalc
[ ] Larger font by default (check out example in es6-slickgrid)
[ ] Column extensions / query builder
[ ] Filter support on base query (needed for ds = ...)
[ ] Query console showing generated queries
[ ] Heat maps
[ ] Spark lines

### Notes, playing with Amazon Athena (Presto for S3):

### Thoughts, 29May20

- Maybe "Relatable" is a good name for reltab
- Maybe the query builder UI for Relatable should be its own thing, independent of Tad. Capable of providing JS or SQL.
- Need to think about a real synthetic Data type for sqlite for CSVs, both in import and subsequent handling. Download data set from https://ourworldindata.org/grapher/new-covid-deaths-per-million for perfect example.

### Instance IDs and Multiplexing connections

We need to think about how to identify database instances.

#### Reminder to self, 3Jul20:

- Issue right now is that tableMap is not properly populated.
  Problem is that right now we're warming this with explicit calls to dbc.getTableInfo in places like
  actions.openTable, actions.openSourcePath and electronRenderMain.
  Unfortunately caching is happening in getConnection(), and this includes options in the memo key, so
  we end up with distinct db connections...

The right way to fix:
(1) Really need to walk any queries, gather all table names, and ensure we have TableInfo for all table
names before trying to do a GetSchema operation.
(2) Should probably try harder to pass around the right options along with the connection key to avoid
opening extra connections to the db.

#### Thoughts on sharing client/server remoting across Electron and web, 6Nov20

It would sure be nice if we could just have one simple remote / proxy request abstraction that would work across
either http or Electron's remote mechanism, and not have to duplicate all the JSON encoding / decoding for remote
functions / methods for web and Electron app.

This is particularly timely since Electron's remote module has been deprecated:
https://www.electronjs.org/docs/breaking-changes#deprecated-remote-module

We should replace with a call to ipcRenderer.invoke:
https://www.electronjs.org/docs/api/ipc-renderer#ipcrendererinvokechannel-args

Note that this is tantalizingly close to the request() API in the tadweb-app...

#### Some Quick Notes to get re-oriented

Right now:

- Just got web app working again, but only barely. Tree control is buggy -- seeing sqlite datasets under
  bigquery entry, and CSV file getting re-imported on every full reload.
- To start let's debug and fix tree control. Should also check and ensure right dbconnection info
  getting passed to various methods like evalquery.
- Need to think through a multiple tab / worksheet model. Probably OK to have tree control on left, but
  if user has made _any_ changes to the view params, need to prompt before replacing if they select a
  different data set.
  Bigger point: Tree selector is one form of baseline "New" or "Open" action, creating a new view.
- Should allow main view of a tab to be empty, for case when no data source has yet been selected.
- Importing a CSV is one place where web and Electron UIs will differ a bit. Straightforward
  local file picker for Electron, but need some kind of upload dialog, possibly also allowing something
  like an URL or s3 bucket address.

#### Notes to self, 18Nov20

- We now have a single common client/server in (reltab/remote) that is used by both Electron and Web. Big relief.
- But: We still have a handful of assumptions we need to fix:
  [X] The main function of both apps is still built around importing a single CSV file
  [ ] AppState assumes a single table and a single pivot table. Need to support an empty / New state where no
  table has been selected, and add support for multiple tabs.
  [ ] Need to be able to identify ViewState as dirty, and allow tree selection of tables from data sources so long as no edits have been made to view state.
  [ ] Need to modify UI to support multiple tabs, move tree selector to individual tabs.
  [ ] Need some UI for importing a CSV into a database as a table
- Let's build a Snowflake data source and dialect.

### Nov24

OK, we have a basic Snowflake data provider.
Now let's tackle the refactor for having multiple tabs, and being able to use Tad as a table browser.
Let's start by tweaking AppState to be able to support an empty grid (no source table selected)

### Notes, building for snowvation-2020

Getting errors with slickgrid, due to:

imagemin-pngquant failing

gifsicle failing

Trying: brew install gifsicle

Also getting issues with:

    ERROR in /Users/acourtney/repos/tad-pkg/node_modules/slickgrid-es6/images/sort-desc.png
    Module build failed (from /Users/acourtney/repos/tad-pkg/node_modules/image-webpack-loader/index.js):
    Error:
        at afterWriteDispatched (internal/stream_base_commons.js:150:25)
        at writeGeneric (internal/stream_base_commons.js:141:3)
        at Socket._writeGeneric (net.js:771:11)
        at Socket._write (net.js:783:8)
        at doWrite (_stream_writable.js:431:12)
        at writeOrBuffer (_stream_writable.js:415:5)
        at Socket.Writable.write (_stream_writable.js:305:11)
        at Socket.Writable.end (_stream_writable.js:594:10)
        at Socket.end (net.js:575:31)
        at handleInput (/Users/acourtney/repos/tad-pkg/node_modules/imagemin-pngquant/node_modules/execa/index.js:87:17)
        at module.exports (/Users/acourtney/repos/tad-pkg/node_modules/imagemin-pngquant/node_modules/execa/index.js:310:2)
        at /Users/acourtney/repos/tad-pkg/node_modules/imagemin-pngquant/index.js:57:21
        at /Users/acourtney/repos/tad-pkg/node_modules/p-pipe/index.js:12:25
     @ ./src/slickgrid.scss (/Users/acourtney/repos/tad-pkg/node_modules/css-loader/dist/cjs.js!/Users/acourtney/repos/tad-pkg/node_modules/resolve-url-loader!/Users/acourtney/repos/tad-pkg/node_modules/sass-loader/dist/cjs.js!./src/slickgrid.scss) 4:36-103
     @ ./src/slickgrid.scss
     @ ./src/tadviewer.ts

Based on some random similar issues in this SO question:
https://stackoverflow.com/questions/54354644/error-in-module-build-failed-from-node-modules-sass-loader-lib-loader-js

went with:

```
npm install --save-dev node-sass
```

in tadviewer, which seemed to resolve the issue.

(This dependency existed elsewhere, also needed to make versions consistent and up to latest)

---

9Dec20:

Need to build in an environment with a slightly older version of Node, incompatible with my recent updates to node-sqlite.
Turning off reltab-sqlite for the web based builds for now. Revisit when attempting to build the Electron app again.
Note: I temporarily removed sqlite from Lerna bootstrap in lerna.json. Need to rethink at some point when I revist building the standalone app.

---

Snowvation-2020: 9Dec20:

Filters are failing because defaultDialect from reltab is null, so can't render in Footer.

X let's figure out how to turn on showQueries.
and show the reltab JS

Sort order messed up with null values in pivot column

column names and types overflowing in column selector

======
21Jul21:

Getting annoying issues again with the sqlite3 dependency in reltab-sqlite,
and can no longer do:

```sh
$ npm install --build-from-source
```

in reltab-sqlite because it's attempting to install reltab from npm, even after it has been
npm linked.

Trying to remove:
"bootstrap": {
"ignore": "reltab-sqlite"
},

from lerna.json (under "command") to see if it helps.

Right thing here is probably going to be to either publish my fork of node-sqlite3 in npm,
or possibly just rip it out entirely, since we're hopefully moving to DuckDB as the default
engine.

=====
22Jul21:

To get working _right now_:

[X] Open specific file in all when file given via command line
[X] Show loading indicator during initial load
[X] Better loading indicator!
[X] Switch engine for tad-app to DuckDb

23Jul21:

To show loading indicator, need to initialize before doing import.

This requires pretty much over-hauling the initialization path to make a bunch
of things that currently happen during initialization happen later.

Was tempted to add multiple tab support, but this will be more involved than I
have time to address, and isn't worth not releasing.

[X] Restore Quick Start guide / show quick start on first run
[X] Verify that "Open Example" works from Quickstart guide
[X] Ensure all menu actions (like export filtered CSV) work
[ ] Fix tree open control to not accidentally replace a modified view.
Options: replace current view, open in new window. File...Open should probably work
the same
[ ] Smoke test select control for "in..." filter queries. Try one from Blueprint directly?
[ ] Status bar in footer
[ ] Query console
[X] Parquet file support: --parquet argument
[X] Parquet file support: .parquet suffix
[ ] compressed, gzipped CSV file support
[ ] Ability to save and open Tad files
[ ] Opening a Tad file
[ ] Get rid of BigQuery support by default -- ~/tad.conf.json
[ ] Ability to open directories with DuckDb import/export format
[ ] Ability to open CSV / Parquet files directly from s3
[ ] Test all the ways that Tad might be opened: Finder context menu, dragging on to app icon, etc.
[ ] Better naming for DuckDb in data source explorer tree
[ ] Specifying a path to a sqlite db file
[ ] Reduce height of column selector to fit in standard window without scrolling
[ ] tweak column widths in column selector to avoid overflow of column type
[ ] test of column types. MetObjects.csv seems to have a TIMESTAMP
[ ] Verify that tad command line utility works for launching tad
[ ] Check that all command-line arguments work as advertised
[X] Critical bug: Can't enter non-integral values for floats. Try imdb_score > 8.5 in movie_metadata
[X] Bug: Seemed to get a crash when filling in a value in filter in "Contains..." for string column (quoting issue)
[X] Replace resize handler / ResizeObserver with Blueprint's React supporting one
[-] Add multiple tab support
[-] Add option to open a file / table in a new tab or new window.

Probably want a way to specify (multiple) data sources and files to open on command line.

Looks like electron-builder is making some bad assumptions about finding node dependencies
directly in node_modules. Let's put off this part until everything else is done.

8Aug21:

Trying to sort out an issue with webpack apparently creating multiple instances of loglevel module.
