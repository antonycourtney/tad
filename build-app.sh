#!/bin/bash
# A script to try and build everything, bottom-up
#
# NOTE: Run 'npm run bootstrap' before running this script!
# See README.md for details
(cd packages/reltab && npm run build)
(cd packages/aggtree && npm run build)
(cd packages/reltab-sqlite && npm run build)
(cd packages/reltab-duckdb && npm run build)
(cd packages/reltab-fs && npm run build)
(cd packages/tadviewer && npm run build-dev)
(cd packages/tad-app && npm run build-dev)
