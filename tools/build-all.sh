#!/bin/bash
set -e
myDir="$(dirname "$0")"
source "$myDir/buildUtils.sh"

build_packages "${allPackages[@]}"