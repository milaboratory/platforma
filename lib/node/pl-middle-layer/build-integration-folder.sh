#!/usr/bin/env bash

function copyDevBlock() {
  src=$1
  dst=$2
  echo ${dst}
  cd $src
  echo "In $(pwd)"
  npm run build
  mkdir -p "${dst}/backend/dist/tengo/tpl/"
  mkdir -p "${dst}/config/dist/"
  mkdir -p "${dst}/frontend/"
  mkdir -p "${dst}/frontend/dist"
  cp backend/dist/tengo/tpl/main.plj.gz "${dst}/backend/dist/tengo/tpl/main.plj.gz"
  cp config/dist/config.json "${dst}/config/dist/config.json"
  cp frontend/frontend.tgz "${dst}/frontend/frontend.tgz"
  cp frontend/dist/* "${dst}/frontend/dist/"
  cp pl.package.yaml "${dst}/pl.package.yaml"
}

set -e

( copyDevBlock ../../blocks-beta/block-beta-enter-numbers $(pwd)/integration/block-beta-enter-numbers );
( copyDevBlock ../../blocks-beta/block-beta-sum-numbers $(pwd)/integration/block-beta-sum-numbers );
