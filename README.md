# easypivot

Easypivot is a flexible pivot table implemented in JavaScript.

Easypivot consists of a number of components:

- **csvtojson** - Library and utility routines for converting CSV files to JSON files with adequate meta-data
- **reltab** - JavaScript library for querying relational data sources. Includes a simple in-memory relational engine.
- **aggtree** - JavaScript library for pivot tree tables backed by reltab data sources.
- **pivotview** - UI component that connects **aggtree** to an HTML5 grid (currently SlickGrid)
- **ep-app** - An electron.js based easypivot table viewer that can be used from the command line
