#!/usr/bin/env bash

set -o nounset
set -o errexit
set -o pipefail

# eval "$(ssh-agent)"
# ssh-add

script_dir=$(cd "$(dirname "${0}")" && pwd)
cd "${script_dir}" || exit 1

#
# Configuration
#

: "${SYNC_ORIGIN:="git@github.com:milaboratory/pl.git"}"
: "${SYNC_ORIGIN_REF:="main"}"
: "${SYNC_ROOT:="${script_dir}/proto"}"

: "${SYNC_SHARED_DST_DIR:="shared"}"
: "${SYNC_SHARED_SRC_DIR:="controllers/shared/grpc"}"
: "${SYNC_SHARED_PATHS:="progressapi/:streamingapi/:downloadapi/:lsapi/:uploadapi/:protodep.toml:protodep.lock"}"
: "${SHARED_PACKAGE_NAMESPACE:="github.com/milaboratory/pl/controllers/shared/grpc"}"

: "${SYNC_LOG:="${SYNC_ROOT}/sync-proto.log"}"

#
# Function definitions
#

function split_list() {
  local _list="${1}"
  local _split="${2}"
  (
    IFS="${_split}"
    for p in ${_list}; do
      printf "%s\n" "${p}"
    done
  )
}

function log() {
    printf -- "%s\n" "${*}" |
      tee -a "${SYNC_LOG}"
}

function redirect_log() {
  local _indent="${1:-}"

  sed "s/^/${_indent}/" |
    cat 1>>"${SYNC_LOG}" 2>&1
}

function init_repo() {
  local _origin="${1}"
  local _ref="${2}"
  local _path="${3}"

  git clone \
    --depth 1 \
    --single-branch \
    --branch "${_ref}" \
    "${_origin}" \
    "${_path}"
}

function rsync_proto_files() {
    local _sync_paths="${1}"
    local _sync_src_dir="${2}"
    local _sync_dst_dir="${3}"

    for p in $(split_list "${_sync_paths}" ":"); do
        log "    - '${p}'"
        [[ -f "${_sync_src_dir}/${p}" ]] || mkdir -p "${_sync_dst_dir}/${p}"
        rsync \
            -av \
            --delete \
            --include "*.proto" \
            --include "*.yaml" \
            --include "*.json" \
            --include "*.lock" \
            --include "*.toml" \
            --exclude "*" \
            "${_sync_src_dir}/${p}" "${_sync_dst_dir}/${p}" | redirect_log "      "
        echo "" | redirect_log
    done
}

function cleanup() {
  local _tmp_repo="${1}"

  echo "  Removing tmp repository copy..."
  rm -rf "${_tmp_repo}"

  # Reset trap to prevent double runs if cleanup() after manual 'cleanup' call
  trap 'true' EXIT
}

#
# Actual script run
#
rm -f "${SYNC_LOG}"

version="${1:-}"
if [ -n "${version}" ]; then
  SYNC_ORIGIN_REF="${version}"
fi

tmp_repo="${SYNC_ROOT}/tmp-repo"

log "Cloning '${SYNC_ORIGIN}@${SYNC_ORIGIN_REF}' into tmp directory '${tmp_repo}'"
init_repo "${SYNC_ORIGIN}" "${SYNC_ORIGIN_REF}" "${tmp_repo}" |& redirect_log "    "
# cd "${tmp_repo}/plapi" && "protodep up --use-https"
trap "cleanup '${tmp_repo}'" EXIT

# cleanup "${tmp_repo}"
log "Updating protocol..."
(
  log "  updating '${SYNC_SHARED_SRC_DIR}' proto definitions..."
  rsync_proto_files "${SYNC_SHARED_PATHS}" "${tmp_repo}/${SYNC_SHARED_SRC_DIR}" "${SYNC_ROOT}/${SYNC_SHARED_DST_DIR}"

  log "  updating proto dependencies..."
  cd "${SYNC_ROOT}/${SYNC_SHARED_DST_DIR}"
  protodep up --use-https
)

echo ""
echo "Fill sync log was saved to:"
echo "  ${SYNC_LOG}"
