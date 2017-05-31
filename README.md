# Tad

Tad is a desktop application for viewing and analyzing tabular data such as CSV files.

You can launch tad from the command line like this:

    $ tad movie_metadata.csv

This will open a new window with a scrollable view of the file contents:

![Tad screenshot](src/doc/screenshots/tad-movies-unpivoted.png "Unpivoted view of CSV file")

Tad's main grid component is actually a full featured
[pivot table](https://en.wikipedia.org/wiki/Pivot_table); a few additional mouse clicks from the above view yields this:

![tad screenshot](src/doc/screenshots/tad-movies-pivoted.png "Movie Metadata with Pivots")

# Installing Tad

The easiest way to install Tad is to use a pre-packaged binary release.  See [The Tad Landing Page](http://tadviewer.com/#news) for information on the latest release and a download link.

# Building Tad from source

Detailed instructions on building tad from sources available in [src/doc/building.md](src/doc/building.md)

# Implementation / architecture

Tad is an [Electron](http://electron.atom.io/) application written in ES2015 using [flow](https://flowtype.org/) type annotations.
Tad's front end User Interface is implemented in [React](https://facebook.github.io/react/), using [SlickGrid](https://github.com/mleibman/SlickGrid) for the main grid component.
In the main process, Tad uses [SQLite](https://sqlite.org/) for internal storage and efficient queries on tabular data.  
The Tad internals need more documentation; for now there is a [sloppy hand-drawn sketch](src/doc/internal/architecture-sketch.pdf) outlining the basic structure.
