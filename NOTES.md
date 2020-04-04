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
- **reltab-server** - (TODO: Node.js / Express based server, derived from electron app / renderer separation)
- **reltab-client** - WebSocket client for reltab, based on reltab-remote for Electron app


Should finish porting over the reltab-sqlite tests Jest.  This will be key to ensuring things don't break.
Then we should do:

- **reltab-postgres** - Postgres driver for reltab
- **reltab-bigquery** - Google BigQuery driver for reltab

Then should think about making Tad a more full-fledged database pivot table. Want two key UI enhancements:
   - Table Browser
   - Multiple Tabs
and look into doing a Node.js / Express server for Tad.