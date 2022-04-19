#!/bin/bash
set -x
files=$(ls src/*.js)
for f in $files
do
  bnm=$(basename -s .js $f)
  babel --plugins babel-plugin-flow-to-typescript $f -o 'src/'$bnm'.ts'
done
