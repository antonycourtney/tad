# Building Tad from Sources

## Pre-requisites: Node, Npm and Lerna

To build Tad, you should have [node](https://nodejs.org/en/) and `npm`(https://www.npmjs.com/get-npm) (included when you install Node.js) installed. The versions of these tools used for development are:

    $ node --version
    v16.5.0
    $ npm --version
    7.19.1

Once you have Node installed, run `npm install` at the top level:

    $ npm install

## Installing dependencies and linking modules (Bootstrapping)

Lerna supports a process called [bootstrapping](https://github.com/lerna/lerna/tree/main/commands/bootstrap#readme) that links local packages together and installs any remaining dependencies. To the extent possible, lerna tries to hoist common dependencies needed by different packages in the monorepo.
To bootstrap Tad correctly, run the following:

    $ npm run bootstrap

This runs the standard lerna `bootstrap` command with a few extra arguments needed for how Tad's source is structured.

## Building Everything

After bootstrapping, run the following script to try and build everything, including the web app (tadweb-app), reference web server (tadweb-server), and desktop app:

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

You can try out the experimental backends by setting appropriate environment variables and un-commenting
the relevant `init` calls in `main()` in [../src/tadweb-server/server.ts](../src/tadweb-server/server.ts).

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

# Additional Info

## Useful paths:

Log information (from [electron-log](https://www.npmjs.com/package/electron-log)):

- on Linux: ~/.config/Tad/main.log
- on OS X: ~/Library/Logs/Tad/main.log
- on Windows: %USERPROFILE%\AppData\Roaming\Tad\main.log
