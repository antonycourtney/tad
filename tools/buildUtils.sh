#!/bin/bash

myDir="$(dirname "$0")"
source "$myDir/packages.sh"

function build_packages()
{
  targetPackages=("$@")
  for pkg in "${targetPackages[@]}" 
  do
    echo "building $pkg"
    (cd "packages/$pkg" && npm run build)
  done
}