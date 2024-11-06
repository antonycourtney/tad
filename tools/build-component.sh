#!/bin/bash
# Build just the component packages (tadviewer)
set -e
myDir="$(dirname "$0")"
source "$myDir/buildUtils.sh"

build_packages "${componentPackages[@]}"