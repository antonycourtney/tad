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
[ ] Electron app: port various event handlers from renderMain
[ ] Electron app: Deal with 'tadopenexternal' (TextFormatOptions.ts) to open external links from electron app
