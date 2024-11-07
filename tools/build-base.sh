#!/bin/bash
# Build just the base packages (reltab & aggtree)
set -e
myDir="$(dirname "$0")"
source "$myDir/buildUtils.sh"

build_packages "${basePackages[@]}"