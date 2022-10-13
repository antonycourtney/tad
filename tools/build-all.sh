#!/bin/bash

myDir="$(dirname "$0")"
source "$myDir/buildUtils.sh"

build_packages "${allPackages[@]}"