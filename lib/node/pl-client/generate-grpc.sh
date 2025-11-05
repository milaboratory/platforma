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

: "${TS_PROTO_PLUGIN:="${script_dir}/node_modules/.bin/protoc-gen-ts"}"
: "${PROTO_PLAPI_SRC:="${script_dir}/proto/plapi"}"
: "${PROTO_PLAPI_NAMESPACE:="github.com/milaboratory/pl/plapi"}"

: "${PROTO_SHARED_SRC:="${script_dir}/proto/shared"}"
: "${PROTO_SHARED_NAMESPACE:="github.com/milaboratory/pl/controllers/shared/grpc"}"

: "${PROTO_OUT_PATH:="${script_dir}/src/proto-grpc"}"

# List of paths to search for includes.
# This is like PATH variable for binaries, but for .proto files.
# Use ':' as delimiter, like in PATH.
: "${PROTO_PATH:=${C_INCLUDE_PATH:-"/usr/local/include"}}"

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
    local _namespace="${1}"
    local _sources="${2}"
    local _root="${3}"

    # Binary to use for go code generation from protocol files:
    #   protoc-gen-<generator>
    local _generator="ts"

    local _generator_opts=(
      --"${_generator}_opt=client_generic"
      # --"${_generator}_opt=long_type_string"
      --"${_generator}_opt=optimize_speed"
      --"${_generator}_opt=generate_dependencies"
      --"${_generator}_opt=force_server_none"
    )

    local _include_paths=()
    for _p in $(split_list "${PROTO_PATH}" ":"); do
      _include_paths+=(--proto_path="${_p}/")
    done
    if [ -d "${_root}/.proto/github.com/googleapis/googleapis/" ]; then
      # Special hack to make googleapis available.
      # There's a mess in google's own proto directory structure, namespaces and packages.
      _include_paths+=(--proto_path="github.com/googleapis/googleapis/")
    fi
    _include_paths+=(
        --proto_path="./"
    )

    echo "Generating '${_sources}'..."
    (
        # add debug output to the block
        set -x
        mkdir -p "${PROTO_OUT_PATH}"
        cd "${_root}/.proto/"
        protoc \
            --plugin="${TS_PROTO_PLUGIN}" \
            "${_include_paths[@]}" \
            "${_generator_opts[@]}" \
            --${_generator}_out="${PROTO_OUT_PATH}" \
            "./${_namespace}/${_sources}/"*.proto
    ) |& prefix_lines "  "
}

#
# Actual script run
#

plapi_to_generate=(
    "plapiproto"
)

mkdir -p "${PROTO_PLAPI_SRC}/.proto/${PROTO_PLAPI_NAMESPACE}"
for pkg in "${plapi_to_generate[@]}"; do
    pkg_path="${PROTO_PLAPI_SRC}/.proto/${PROTO_PLAPI_NAMESPACE}/${pkg}"
    if [ -n "${pkg_path}" ] && ! [ -e "${pkg_path}" ] ; then
        ln -s "${PROTO_PLAPI_SRC}/${pkg}" "${pkg_path}"
    fi
done

for path in "${plapi_to_generate[@]}"; do
    generate "${PROTO_PLAPI_NAMESPACE}" "${path}" "${PROTO_PLAPI_SRC}"
    echo ""
done

shared_to_generate=(
    "progressapi"
    "streamingapi"
    "downloadapi"
    "lsapi"
)

mkdir -p "${PROTO_SHARED_SRC}/.proto/${PROTO_SHARED_NAMESPACE}"
for pkg in "${shared_to_generate[@]}"; do
    pkg_path="${PROTO_SHARED_SRC}/.proto/${PROTO_SHARED_NAMESPACE}/${pkg}"
    if [ -n "${pkg_path}" ] && ! [ -e "${pkg_path}" ] ; then
        ln -s "${PROTO_SHARED_SRC}/${pkg}" "${pkg_path}"
    fi
done

for path in "${shared_to_generate[@]}"; do
    generate "${PROTO_SHARED_NAMESPACE}" "${path}" "${PROTO_SHARED_SRC}"
    echo ""
done
