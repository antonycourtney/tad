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
[ ] Optimize SQL construction a bit -- a sequence of projects currently looks very sub-optimal, as do multiple extends.
Look at bigquery ops with sorted aggtree.
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
[X] Critical bug: Can't enter non-integral values for floats. Try imdb_score > 8.5 in movie_metadata
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
[X] Fix tree open control to not accidentally replace a modified view.
Options: replace current view, open in new window. File...Open should probably work
the same
[X] fix csvexport once we've gotten rid of appRtc (kill all refs to appRtc)
[X] allow multiple csv files on command line
[X] import on-demand of files
[X] folder view of fs directory
[X] Opening of parquet files
[X] Rip out old --parquet support
[X] Ensure we can open directories from open dialog (openDialog / showOpenDialogSync)
[X] Probably want a way to specify (multiple) data sources and files to open on command line.
[X] opening of sqlite files from cmd line
[X] opening of sqlite files from open dialog
[X] opening of duckdb files from cmd line
[X] opening of duckdb files from open dialog
[X] Make File...Open follow same approach as switching source table in sidebar: prompt if changed.
(Requires also adding a "New Tad Window" and "Open in New Window..." to app menus)
[X] Only allow opening of known extensions (".csv", ".tsv", ".parquet") from reltab-fs (indicate in UI?)
[X] Do we still need --no-headers?
[X] Figure out saving and loading of Tad files, since we support in-memory tables as well
as file imports
[X] Ability to save and open Tad files
[X] Try switching back from atl to ts-loader to avoid deprecation warnings on build
[X] Make sure we can build all packages without errors
[X] Open data source sidebar after opening a directory
[X] New Tad Window menu option
[X] Check out alltypes_plain.parquet, and figure out what's happening with date_string_col and string_col,
which are rendering as Buffer. Probably make a test file with all DuckDb column types.
[ ] Get all tests working again (sqlite)
[X] add a build-all.sh at top level (and maybe build-web.sh, build-app.sh, with common script for topo sort?)
[X] Change window title when loading new data set
[X] refresh db tree after File...Open
[-] change name of db for DuckDb from :memory:
[X] Smoke test select control for "in..." filter queries. Try one from Blueprint directly?
[X] Parquet file support: --parquet argument
[X] Parquet file support: .parquet suffix
[X] compressed, gzipped CSV file support (supported by DuckDb?)
[X] Get rid of BigQuery support by default -- ~/tad.conf.json
[X] Ability to open directories with DuckDb import/export format
[ ] Reduce height of column selector to fit in standard window without scrolling
[X] tweak column widths in column selector to avoid overflow of column type
[X] test of column types. MetObjects.csv seems to have a TIMESTAMP
[X] Critical bug: Can't enter non-integral values for floats. Try imdb_score > 8.5 in movie_metadata
[X] Bug: Seemed to get a crash when filling in a value in filter in "Contains..." for string column (quoting issue)
[X] Replace resize handler / ResizeObserver with Blueprint's React supporting one
[-] Add multiple tab support
[-] Add option to open a file / table in a new tab or new window.
[X] Get New Window working even when no file open
[ ] Upgrade dependencies as much as practical
[ ] Test Windows build
[ ] Test Linux build

Later:
[ ] Command line options for specifying a sqlite or duckdb _table_ path directly. (Maybe just any DataSourcePath)?
[ ] Experimental support for other backends via ~/tad.conf.json
[ ] Status bar in footer
[ ] Query console
[X] Ability to open CSV / Parquet files directly from s3
[ ] Get sqlite (and other) tests working again

Packaged build stuff:
[X] Add more to electron file extensions (.csv.gz didn't work, add .gz and check file at runtime?)
[X] Get quickstart working again in packaged build
[X] Verify that opening example and link clicking works in quickstart
[ ] See if we can keep a single instance of Tad and multiple windows in newer version of electron
[X] Verify that tad command line utility works for launching tad
[ ] Check that all command-line arguments work as advertised
[ ] Test all the ways that Tad might be opened: Finder context menu, dragging on to app icon, etc.

8Aug21:

[X] Trying to sort out an issue with webpack apparently creating multiple instances of loglevel module.

16Oct21:
[X] Rethink how we present data sources, and handle importing. Probably we should not
show the DuckDb instance that is used for importing a CSV; we probably all references
to refer to the original CSV file path. Especially true if we start supporting s3 buckets.

17Oct21:

Let's clean up data sources.
[X] get rid of displayName passed to connect()
[X] get rid of displayName on paths
[X] think about how to represent files, directories and s3 buckets as data sources - the import and cached table should be linked to the data source, but shouldn't show up in source tree

Thinking about paths and data sources:

======
31Dec21:

Trying electron-builder. Getting a binary, but when I open it I get:

Uncaught Exception:
Error: Cannot find module 'source-map-support/register'
Require stack:

- /Users/antony/home/src/tad-pkg/packages/tad-app/dist/mac/tad.app/Contents/Resources/app.asar/dist/main.bundle.js
- at Module.\_resolveFilename (node:internal/modules/cjs/loader:940:15)
  at Function.n.\_resolveFilename (node:electron/js2c/browser_init:249:1128)
  at Module.\_load (node:internal/modules/cjs/loader:785:27)
  at Function.c.\_load (node:electron/js2c/asar_bundle:5:13331)
  at Module.require (node:internal/modules/cjs/loader:1012:19)
  at require (node:internal/modules/cjs/helpers:94:18)
  at Object.884 (/Users/antony/home/src/tad-pkg/packages/tad-app/dist/mac/tad.app/Contents/Resources/app.asar/dist/main.bundle.js:1:41)
  at t (/Users/antony/home/src/tad-pkg/packages/tad-app/dist/mac/tad.app/Contents/Resources/app.asar/dist/main.bundle.js:1:18138)
  at /Users/antony/home/src/tad-pkg/packages/tad-app/dist/mac/tad.app/Contents/Resources/app.asar/dist/main.bundle.js:1:18391
  at Object.<anonymous> (/Users/antony/home/src/tad-pkg/packages/tad-app/dist/mac/tad.app/Contents/Resources/app.asar/d

What's missing in paths right now is having a DataSource itself as the initial path component.

Going to have to re-think providers, connections, connection keys, data sources, and paths.

Right now we don't really have the notion of files, directories (or things like s3 buckets); just databases.

Maybe we should separate the notion of a _data source_ from a _database engine_.
Let's say that _data sources_ are a hierarchy of containers with tables (or views) at the leaf level.

Actually, we won't do that. Let's just call these DataSources, and have filesystem-like data sources
delegate to some other DataSource engine for queries

---

We used to have `displayName` as part of a path element (now DataSourceNodeInfo), which was clearly wrong.

We could think about adding it as optional in `DataSourceNode`.
But also: It's kind of weird to have `DataSourceNodeInfo` that is just a 'kind' paired with the id,
and `description?` living outside.

It should probably be more like:

```typescript
export interface DataSourceNodeMetadata {
  kind: DataSourceKind;
  displayName: string;
}

export interface DataSourceNode {
  id: string;
  meta: DataSourceNodeMetadata;
  children: string[]; // ids to stuff into a path
}
```

=====
7Jan22:

Painful handling of dependencies by electron-builder and lerna:

In the builds of an app, we need different drivers like reltab-duckdb, reltab-sqlite, etc. to use a single instance of
the reltab module.
Using just lerna's bootstrapping and linked dependencies, this works fine.
But when we try and package everything up with electron-builder this way, we get multiple copies of reltab in each
of the drivers. Aside from the bloat (minor), the duplicate reltab instances have their own private state, which
was causing us not to see/find the common set of data sources, connections and other internal state.

A workaround is to move "reltab" and other shared deps from "dependencies" to "peerDependencies".

Unfortunately, this then prevents lerna bootstrap from linking the modules!

An apparent solution is to also add the modules into the "devDependencies" section of each package.

======
Release punch-list:

[X] "Copy" from Edit menu doesn't appear to copy selected cells.
[X] "Send To" menu in installed Tad doesn't seem to work -- try this with a dev instance of Tad open.
[X] Try to add support for reading v1 .tad files
[ ] Update "Quick Start" guide
[X] text styling to ellipsis on long column names in column selector
[ ] Some ability to increase text size on the grid. Global 8pt font in app.less is just too small for
some users
[ ] When opening a directory, .tad files not included in tree view list in sidebar

====
Issues with libcrypto.3.dylib and libssl.3.dylib:

Where to put dylibs when packaging:
https://github.com/electron-userland/electron-builder/issues/5238
http://clarkkromenaker.com/post/library-dynamic-loading-mac/

$ otool -L node-duckdb-addon.node
node-duckdb-addon.node:
@rpath/node-duckdb-addon.node (compatibility version 0.0.0, current version 0.0.0)
@rpath/libduckdb.dylib (compatibility version 0.0.0, current version 0.0.0)
/usr/local/opt/openssl@3/lib/libcrypto.3.dylib (compatibility version 3.0.0, current version 3.0.0)
/usr/local/opt/openssl@3/lib/libssl.3.dylib (compatibility version 3.0.0, current version 3.0.0)
/usr/lib/libc++.1.dylib (compatibility version 1.0.0, current version 904.4.0)
/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1292.60.1)

Looks like we'll need to do:
$ install_name_tool -change /usr/local/opt/openssl@3/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib ./dist/mac/Tad.app/Contents/Resources/app.asar.unpacked/node_modules/node-duckdb/build/Release/node-duckdb-addon.node
$ install_name_tool -change /usr/local/opt/openssl@3/lib/libssl.3.dylib @rpath/libssl.3.dylib ./dist/mac/Tad.app/Contents/Resources/app.asar.unpacked/node_modules/node-duckdb/build/Release/node-duckdb-addon.node

=====
Notarizing the Mac app:
https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/
