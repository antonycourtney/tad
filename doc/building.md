# Building Tad from Sources

## Pre-requisites: Node and Npm

To build Tad, you should have [node](https://nodejs.org/en/) and [npm](https://www.npmjs.com/get-npm) (included when you install Node.js) installed. Tad is developed with Node 22 (see [.nvmrc](../.nvmrc)); if you use [nvm](https://github.com/nvm-sh/nvm), run `nvm use` at the top level. For example:

    $ node --version
    v22.17.0
    $ npm --version
    10.9.2

## Installing dependencies and linking modules

Tad is an [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) monorepo. A single `npm install` at the top level installs all dependencies (hoisted to the top-level `node_modules` where possible) and links the local packages (`reltab`, `tadviewer`, etc.) to each other:

    $ npm install

Use `npm ci` instead for a clean install that exactly matches `package-lock.json`.

To add or upgrade a dependency of a single package, run npm from the top level with `--workspace`, e.g.:

    $ npm install some-package@1.2.3 --workspace tadviewer

## Building Everything

After installing dependencies, run the following script to try and build everything, including the web app (tadweb-app), reference web server (tadweb-server), and desktop app:

    $ ./tools/build-all.sh

## Trying the Desktop app

    $ cd packages/tad-app
    $ npm start -- csv/movie_metadata.csv

If all went well, the Tad app should start with a view of `csv/movie_metadata.csv`

## Trying the experimental web app

    $ cd packages/tadweb-server
    $ npm start

If all goes well, you will see something like:

```
db initialization complete
Listening on port  9000
```

open a web browser to `localhost:9000` and you should see Tad in your web browser.

## Trying Experimental Backends

You can try out the experimental backends by setting the appropriate environment variables (see below) and passing
the corresponding flags when starting the web server:

    $ cd packages/tadweb-server
    $ npm start -- --bigquery --snowflake

Without these flags, the server only uses DuckDB (see `main()` in [server.ts](../packages/tadweb-server/src/server.ts)).

### Snowflake Credentials

If you want to try the **experimental** reltab-snowflake backend, set the environment variables `$RELTAB_SNOWFLAKE_ACCOUNT`, `$RELTAB_SNOWFLAKE_USERNAME` and `$RELTAB_SNOWFLAKE_PASSWORD` with a valid account name, username and password, respectively, for your Snowflake account.

### BigQuery Credentials

If you If you want to try the **experimental** reltab-bigquery backend, and have a Google BigQuery account, set the environment variable `$GOOGLE_APPLICATION_CREDENTIALS` to the path of a bigquery account credentials JSON file.

## Iterating during UI Development: Desktop App

When iterating on the UI during development, I recommend keeping a couple of windows open:

- In `packages\tadviewer`, run `npm run watch`
- In `packages\tad-app`, run `npm run watch`

Note that you'll still have to run `npm run build` if you make changes in any of the other library packages (`reltab`,
`reltab-duckdb`, `aggtree`).

## Iterating during UI Development: Web App

Similar to above, but with three windows open:

- In `packages\tadviewer`, run `npm run watch`
- In `packages\tadweb-app`, run `npm run watch`
- In `tadweb-server`, running `npm start`

With those running continuously, you should be able to just hit reload in your browser on `localhost:9000` to pick up any code changes. You'll still have to run `npm run build` if you make changes in any of the other library packages (`reltab`,
`reltab-duckdb`, `aggtree`, etc.).

## UI Tests (desktop app)

`packages/tad-app/e2e` has [Playwright](https://playwright.dev/docs/api/class-electron) tests that launch the desktop app, open generated test data (a 100,000 row Parquet file, and `.tad` files that open it sorted and pivoted) and drive the grid with the mouse and keyboard. They test the default grid, `DomDataGrid`; `TAD_GRID=glide npm run test:e2e` runs the shared tests against the Glide grid instead.

```
cd packages/tad-app
npm run build-prod   # the tests run the built app in dist/
npm run test:e2e     # or: npx playwright test -g "pivot"
```

Each test opens its own app window on screen, with a temporary user data directory (`TAD_USER_DATA_DIR`), so it won't interfere with an installed copy of Tad. On failure, a screenshot and an accessibility snapshot of the window are saved under `e2e-results/`.

Tests drive the grid through the `GridDriver` interface (`e2e/grid-driver.ts`). The DOM grid's driver (`e2e/dom-grid.ts`) reads cells straight from the page. Glide draws on a canvas, so its driver (`e2e/glide-grid.ts`) reads cell text from the accessibility table that Glide renders alongside it, and finds cell positions through `window.__tadGrid`, which the grid exposes when `TAD_TEST_HOOKS=1`.

## Choosing the grid

The desktop and web apps use `DomDataGrid` by default. While it replaces the older grids, they can still be selected for comparison with `TAD_GRID=slickgrid` or `TAD_GRID=glide` in the environment (desktop app), or `localStorage.tadGrid = "slickgrid"` (web app).

# Additional Info

## Useful paths:

Log information (from [electron-log](https://www.npmjs.com/package/electron-log)):

- on Linux: ~/.config/Tad/main.log
- on OS X: ~/Library/Logs/Tad/main.log
- on Windows: %USERPROFILE%\AppData\Roaming\Tad\main.log

## Packaging the Desktop App

`npm run dist` in `packages/tad-app` packages the desktop app with [electron-builder](https://www.electron.build/). Its output (installers, and the unpacked app in e.g. `release/mac-arm64`) goes to `packages/tad-app/release`, which is kept separate from the webpack output in `dist` so that previous builds don't get bundled into the app.
