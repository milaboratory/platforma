#!/usr/bin/env bash

set -o nounset
set -o errexit

script_dir=$(cd "$(dirname "${0}")" && pwd)
cd "${script_dir}/.."

# # No idea on how to achieve the same effect in pure package.json scripts: we need to restore
# # state of the repository anyway, regardless of errors we face during build.
# # At the same time we need to return non-zero exit code if any error occurs during the process.
# trap './scripts/cut-comments.sh restore' EXIT

echo "Cleaning unused imports in tengo code..."
./scripts/clean-imports.sh fix

# echo "Removing comments before build to make templates more compact..."
# ./scripts/cut-comments.sh compact

echo "Running tengo check (pl-tengo check)..."
pl-tengo check

echo "Building tengo templates (pl-tengo build)..."
pl-tengo build
