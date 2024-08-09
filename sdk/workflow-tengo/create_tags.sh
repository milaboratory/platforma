#/usr/bin/env bash

# turn on for debug
# set -x

# This turns on `**` functionality in glob patterns
shopt -s globstar

tags_file_name=$1
other_args=$2

# see https://docs.ctags.io/en/latest/man/ctags-optlib.7.html#perl-pod
ctags -f "${tags_file_name}" ${other_args} \
      --langdef=tengo \
      --map-tengo=+.tengo \
      --kinddef-tengo=f,function,function \
      --regex-tengo='/^\s*(.*)(:| :=| =) ?func.*/\1/f/' \
      --kinddef-tengo=c,constant,constant \
      --regex-tengo='/^\s*(.*) := \".*/\1/c/' \
      -R ../**/src/**/*.tengo
