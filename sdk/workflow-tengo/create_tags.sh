#/usr/bin/env bash

# The script creates ctags, install them
# with `brew install universal-ctags`.
# For vscode, you should also install ctags extension.
#
# Usage for vscode: ./create_tags.sh
# Usage for emacs: ./create_tags.sh TAGS true -e

# turn on for debug
# set -x

# This turns on `**` functionality in glob patterns
shopt -s globstar

# the name of the file
tags_file_name=${1:-.tags}

# should create tags from .. (if true) or from . (if fals)
if [[ "${2:-false}" == "true" ]]; then
    from_parent_root=..
else
    from_parent_root=.
fi;

# -e for emacs, nothing for vscode
other_args=${3:-}

echo
echo
echo Create ctags file \""${tags_file_name}"\" from this root dir: \""${from_parent_root}"\", Additional args: ${other_args}
echo

# see https://docs.ctags.io/en/latest/man/ctags-optlib.7.html#perl-pod
ctags -f "${tags_file_name}" ${other_args} \
      --langdef=tengo \
      --map-tengo=+.tengo \
      --kinddef-tengo=f,function,function \
      --regex-tengo='/^\s*(.*)(:| :=| =) ?func.*/\1/f/' \
      --kinddef-tengo=c,constant,constant \
      --regex-tengo='/^\s*(.*) := (\"|\{).*/\1/c/' \
      -R \
      ${from_parent_root}/**/src/**/*.tengo \
      ${from_parent_root}/**/node_modules/@milaboratory/**/*.tengo \
      2>/dev/null

echo Done.
