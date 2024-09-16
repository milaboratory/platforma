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

: "${SYNC_TARGET_ROOT:="${script_dir}/proto/plapi"}"
: "${SYNC_ORIGIN_ROOT:="plapi"}"
: "${SYNC_PATHS:="plapiproto/:plapi/:protodep.toml:protodep.lock"}"

: "${SYNC_TARGET_SHARED_ROOT:="${script_dir}/proto/shared"}"
: "${SYNC_ORIGIN_SHARED_ROOT:="controllers/shared/grpc"}"
: "${SYNC_SHARED_PATHS:="progressapi/:streamingapi/:downloadapi/:lsapi/:protodep.toml:protodep.lock"}"

: "${SYNC_LOG:="${script_dir}/proto/sync-proto.log"}"

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
    local _sync_root="${2}"
    local _sync_target_root="${3}"
    local _tmp_repo="${4}"

    for p in $(split_list "${_sync_paths}" ":"); do
        log "    - '${p}'"
        [[ -f "${_tmp_repo}/${_sync_root}/${p}" ]] || mkdir -p "${_sync_target_root}/${p}"
        rsync \
            -av \
            --delete \
            --include "*.proto" \
            --include "*.lock" \
            --include "*.toml" \
            --exclude "*" \
            "${_tmp_repo}/${_sync_root}/${p}" "${_sync_target_root}/${p}" | redirect_log "      "
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
mkdir -p "${SYNC_TARGET_ROOT}"
rm -f "${SYNC_LOG}"

version="${1:-}"
if [ -n "${version}" ]; then
  SYNC_ORIGIN_REF="${version}"
fi

tmp_repo="${SYNC_TARGET_ROOT}/tmp-repo"

log "Syncing '${SYNC_ORIGIN_REF}' proto version..."
log "  Cloning '${SYNC_ORIGIN}' into tmp directory ${tmp_repo}"
init_repo "${SYNC_ORIGIN}" "${SYNC_ORIGIN_REF}" "${tmp_repo}" |& redirect_log "    "
# cd "${tmp_repo}/plapi" && "protodep up --use-https"
 trap "cleanup '${tmp_repo}'" EXIT

log "  Syncing proto files from '${SYNC_ORIGIN_ROOT}'"
rsync_proto_files "${SYNC_PATHS}" "${SYNC_ORIGIN_ROOT}" "${SYNC_TARGET_ROOT}" "${tmp_repo}"

log "  Syncing shared proto files from '${SYNC_ORIGIN_SHARED_ROOT}'"
rsync_proto_files "${SYNC_SHARED_PATHS}" "${SYNC_ORIGIN_SHARED_ROOT}" "${SYNC_TARGET_SHARED_ROOT}" "${tmp_repo}"

# cleanup "${tmp_repo}"
echo "Update";
log "Updating dependencies..."
(
    cd ./proto/plapi/ && protodep up
)

(
    cd ./proto/shared/ && protodep up
)

echo ""
echo "Fill sync log was saved to:"
echo "  ${SYNC_LOG}"
