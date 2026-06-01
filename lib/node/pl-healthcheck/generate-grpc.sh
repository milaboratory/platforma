#!/usr/bin/env bash

set -o nounset
set -o errexit
set -o pipefail

script_dir=$(cd "$(dirname "${0}")" && pwd)
cd "${script_dir}" || exit 1

: "${TS_PROTO_PLUGIN:="${script_dir}/node_modules/.bin/protoc-gen-ts"}"
: "${PROTOC:="${script_dir}/../../../scripts/protoc.sh"}"

: "${PROTO_SRC:="${script_dir}/proto"}"
: "${PROTO_OUT_PATH:="${script_dir}/src/proto-grpc"}"

function prefix_lines() {
  local _indent="${1}"
  sed "s/^/${_indent}/"
}

generator_opts=(
  --ts_opt=client_generic
  --ts_opt=optimize_speed
  --ts_opt=generate_dependencies
  --ts_opt=force_server_none
)

echo "Generating grpc/health/v1..."
(
  set -x
  mkdir -p "${PROTO_OUT_PATH}"
  cd "${PROTO_SRC}"
  "${PROTOC}" \
    --plugin="${TS_PROTO_PLUGIN}" \
    --proto_path="./" \
    "${generator_opts[@]}" \
    --ts_out="${PROTO_OUT_PATH}" \
    ./grpc/health/v1/*.proto
) |& prefix_lines "  "
