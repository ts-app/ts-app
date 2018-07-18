#!/usr/bin/env bash

rm package-lock.json
rm -fr node_modules

for dir in packages/* ; do
    rm $dir/package-lock.json
    rm -fr $dir/dist
    rm -fr $dir/node_modules
    rm $dir/*.tgz
done
