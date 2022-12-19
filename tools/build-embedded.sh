#!/bin/bash
# Build just the modules needed for tad packaged as an embeddable component
set -e
myDir="$(dirname "$0")"
source "$myDir/buildUtils.sh"

build_packages "${embeddedPackages[@]}"