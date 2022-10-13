#!/bin/bash

#
# packages in topologically sorted order.
#
# lerna should be able to derive this from linked deps
# but we have to use peerDependencies to ensure proper
# linked package deduplication by electron-builder
basePackages=(reltab aggtree)
driverPackages=(reltab-sqlite reltab-duckdb reltab-fs reltab-aws-athena reltab-bigquery reltab-snowflake)
componentPackages=(tadviewer)
appPackages=(tadweb-app tadweb-server tad-app)
allPackages=("${basePackages[@]}" "${driverPackages[@]}" "${componentPackages[@]}" "${appPackages[@]}")
# embeddedPackages builds everything except the app packages
embeddedPackages=("${basePackages[@]}" "${driverPackages[@]}" "${componentPackages[@]}")