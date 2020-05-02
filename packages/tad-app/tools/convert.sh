#!/bin/bash
set -x
files=$(ls app/*.js)
for f in $files
do
  bnm=$(basename -s .js $f)
  babel --plugins babel-plugin-flow-to-typescript $f -o 'app/'$bnm'.ts'
done
