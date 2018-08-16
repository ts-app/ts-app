#!/usr/bin/env bash
set -e

npm install
lerna bootstrap --hoist
lerna run compile
