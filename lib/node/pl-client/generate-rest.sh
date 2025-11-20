#!/usr/bin/env bash

set -o nounset
set -o errexit
set -o pipefail

# You can install needed dependencies via `./bootstrap.sh`

script_dir=$(cd "$(dirname "${0}")" && pwd)
cd "${script_dir}" || exit 1

#
# Configuration
#

: "${PROTO_PLAPI_SRC:="${script_dir}/proto/plapi"}"
: "${PROTO_OUT_PATH:="${script_dir}/src/proto-rest"}"

#
# Function definitions
#

function split_list() {
  local _list="${1}"
  local _split="${2}"
  (
    IFS="${_split}"
    for p in ${_list}; do
      printf "%s\n" "${p%/}"
    done
  )
}

function prefix_lines() {
  local _indent="${1}"
  sed "s/^/${_indent}/"
}

function generate() {
    local _src_path="${1}"
    local _dst_path="${2}"

    echo "Generating '${_src_path}'..."
    (
        # add debug output to the block
        set -x

        ./node_modules/.bin/openapi-typescript \
          "${_src_path}" \
          --properties-required-by-default \
          --output "${_dst_path}"
    ) |& prefix_lines "  "
}

#
# Actual script run
#

generate "${PROTO_PLAPI_SRC}/plapiproto/openapi.yaml" "${PROTO_OUT_PATH}/plapi.ts"
echo ""
