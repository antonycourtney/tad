#!/bin/bash
# A script to try and build everything, bottom-up
#
# NOTE: Run 'npm run bootrstrap' before running this script!
# See README.md for details
(cd packages/reltab && npm run build)
(cd packages/aggtree && npm run build)
(cd packages/reltab-bigquery && npm run build)
(cd packages/reltab-snowflake && npm run build)
(cd packages/tadviewer && npm run build-dev)
(cd packages/tadweb-app && npm run build-dev)
(cd packages/tadweb-server && npm run build)