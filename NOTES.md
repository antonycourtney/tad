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
[ ] Crash bug when setting formatting for specific column by column name
[ ] Add assertive test using a sqlite db file (not a csv) as data source
[ ] Optimize SQL construction a bit -- a sequence of projects currently looks very sub-optimal, as do multiple
extends. Look at bigquery opps with sorted aggtree.
[ ] JavaScript representation of QueryExp AST for debugging
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
[ ] \*\*\* !! Migrate reltab AST to use typescript tagged unions (kill tableArgs / valArgs)
[ ] Need to account for constant expressions (numbers and string literals) vs column references coming from an extend
operation that can end up in a SQL select column expression. Probably time for a tagged union!
[ ] static analysis of tables mentioned in a query
[ ] Add static validation of JSON data in tadweb-server, using https://github.com/pelotom/runtypes

### Features to add before next release:

[X] Multiple database support (at least bigquery)
[ ] Datasets and table selector UI
[ ] column extensions
[ ] Font size preferences
[ ] Delayed calc mode
[ ] Include query time in footer
[ ] Query console showing generated queries
[ ] date and time columns
[ ] Web server running publicly
[ ] horizontal pivots
[ ] heat maps
[ ] spark lines
[ ] Save views to view store in tadweb-server
[ ] Views loadable by URL
