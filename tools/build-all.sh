#!/bin/bash

myDir="$(dirname "$0")"

source "$myDir/packages.sh"

for pkg in "${allPackages[@]}" 
do
  echo "building $pkg"
  (cd "packages/$pkg" && npm run build)
done