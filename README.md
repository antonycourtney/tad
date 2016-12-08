# Tad

Tad is a desktop application for viewing and analyzing tabular data such as CSV files.

Launch tad from the command line like this:

    $ tad movie_metadata.csv

This will open a new window with a scrollable view of the file contents:

![Tad screenshot](doc/screenshots/tad-movies-unpivoted.png "Unpivoted view of CSV file")

Tad's main grid component is actually a full featured
[pivot table](https://en.wikipedia.org/wiki/Pivot_table); a few additional mouse clicks from the above view yields this:

![tad screenshot](doc/screenshots/movie_pivots.png "Movie Metadata with Pivots")

# Building Tad from Source

## Pre-requisites:  Npm and yarn

To build Tad, you should have [node](https://nodejs.org/en/), `npm`(https://www.npmjs.com/get-npm) (included when you install Node.js) and [yarn](https://yarnpkg.com/) installed.  The versions of these tools used for development are:

    $ node --version
    v7.1.0
    $ npm --version
    3.10.9
    $ yarn --version
    0.17.10

## Clone the repository

    $ git clone git@github.com:antonycourtney/tad.git
    $ cd tad

## Install JavaScript package Dependencies

    $ yarn install

This will install dependencies from `package.json` from npm(https://www.npmjs.com/). This will take some time, particularly if this is the first time you are downloading many of the dependencies.

## Build static assets

This step will install various static assets (such as the Bootstrap CSS file) into a common build directory used by the application:

    $ yarn run build-assets

## Run webpack

Open a new terminal window in the same directory, and run

    $ yarn start webpack:watch

This will use [webpack](https://webpack.github.io/) and [Babel](https://babeljs.io/) to compile and bundle the ES2015 sources into older versions of JavaScript supported by node.js and Chromium.

## Rebuild binary libraries with electron-rebuild

Tad depends on the sqlite npm package, which in turn depends on the SQLite library, implemented in C++.  For reasons I don't fully understand related to how native libraries are
loaded by node.js and Electron, it's necessary to recompile this code from source
*every time a new package is installed in our application*.

To perform this step, run:

    $ yarn run electron-rebuild

This will take considerable time (around 70 seconds on my Late 2013 MacBook Pro).

**Note**:  Every time a new dependency is added to the application (using `yarn add`), it is necessary to redo this step.
It's also necessary to run `yarn install` explicitly first. So the sequence after adding a dependency is:

    $ yarn install
    $ yarn run electron-rebuild

## Run Tad

Finally, to start the application, run:

    $ yarn start csv/bart-comp-all.csv

This should start the application and open a window displaying the contents of the specified CSV file.

# Packaging a Release

I'm using   [electron-builder](https://github.com/electron-userland/electron-builder) for packaging, which uses [electron-packager](https://github.com/electron-userland/electron-packager) for creating
the App. I'm currently building my own `.tgz` file and install script to create the symbolic
link in `/usr/local/bin/tad`; I'm not currently using the generated install wizard (DMG).

Note that, due to an alleged bug in Yarn's handling of sub-processes, *one must use npm (not Yarn!) to run this build step*:

    $ npm run build-release

This should create a full application in `./dist/mac`, and then will create a full release directory and a `.tgz` file in `./release/tad-X.Y.Z-preview.tgz`

# Implementation / Architecture

Tad is an [Electron](http://electron.atom.io/) application written in ES2015 using [flow](https://flowtype.org/) type annotations.
Tad's front end User Interface is implemented in [React](https://facebook.github.io/react/), using [SlickGrid](https://github.com/mleibman/SlickGrid) for the main grid component.
In the main process, Tad uses [SQLite](https://sqlite.org/) for internal storage and efficient queries on tabular data.  (TODO: architecture diagram)
