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

: "${SYNC_PLAPI_DST_DIR:="plapi"}"
: "${SYNC_PLAPI_SRC_DIR:="plapi"}"
: "${SYNC_PLAPI_PATHS:="plapiproto/:protodep.toml:protodep.lock"}"
: "${PLAPI_PACKAGE_NAMESPACE:="github.com/milaboratory/pl/plapi"}"

: "${SYNC_SHARED_DST_DIR:="shared"}"
: "${SYNC_SHARED_SRC_DIR:="controllers/shared/grpc"}"
: "${SYNC_SHARED_PATHS:="progressapi/:streamingapi/:downloadapi/:lsapi/:protodep.toml:protodep.lock"}"
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
            --include "*.json" \
            --include "*.yaml" \
            --include "*.lock" \
            --include "*.toml" \
            --exclude "*" \
            "${_sync_src_dir}/${p}" "${_sync_dst_dir}/${p}" | redirect_log "      "
        echo "" | redirect_log
    done
}

function link_proto_files() {
  local _sync_root="${1}"
  local _sync_paths="${2}"
  local _namespace="${3}"

  local _dst_root="${_sync_root}/.proto/${_namespace}"

  mkdir -p "${_dst_root}"
  local _pkg
  for _pkg in $(split_list "${_sync_paths}" ":"); do
    if [ ! -d "${_sync_root}/${_pkg}" ]; then
      continue
    fi

    ln -s "${_sync_root}/${_pkg}" "${_dst_root}/${_pkg%/}"
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
mkdir -p "${SYNC_ROOT}/${SYNC_PLAPI_DST_DIR}"
mkdir -p "${SYNC_ROOT}/${SYNC_SHARED_DST_DIR}"
rm -f "${SYNC_LOG}"

version="${1:-}"
if [ -n "${version}" ]; then
  SYNC_ORIGIN_REF="${version}"
fi

tmp_repo="${SYNC_ROOT}/tmp-repo"

log "Syncing '${SYNC_ORIGIN_REF}' proto version..."
log "  Cloning '${SYNC_ORIGIN}' into tmp directory ${tmp_repo}"
init_repo "${SYNC_ORIGIN}" "${SYNC_ORIGIN_REF}" "${tmp_repo}" |& redirect_log "    "
# cd "${tmp_repo}/plapi" && "protodep up --use-https"
 trap "cleanup '${tmp_repo}'" EXIT

log "  Syncing proto files from '${SYNC_PLAPI_SRC_DIR}'"
rsync_proto_files "${SYNC_PLAPI_PATHS}" "${tmp_repo}/${SYNC_PLAPI_SRC_DIR}" "${SYNC_ROOT}/${SYNC_PLAPI_DST_DIR}"

log "  Syncing shared proto files from '${SYNC_SHARED_SRC_DIR}'"
rsync_proto_files "${SYNC_SHARED_PATHS}" "${tmp_repo}/${SYNC_SHARED_SRC_DIR}" "${SYNC_ROOT}/${SYNC_SHARED_DST_DIR}"

# cleanup "${tmp_repo}"
echo "Update";
log "Updating dependencies..."
(
  cd "${SYNC_ROOT}/${SYNC_PLAPI_DST_DIR}"
  protodep up --use-https
  link_proto_files "${SYNC_ROOT}/${SYNC_PLAPI_DST_DIR}" "${SYNC_PLAPI_PATHS}" "${PLAPI_PACKAGE_NAMESPACE}"
)

(
  cd "${SYNC_ROOT}/${SYNC_SHARED_DST_DIR}"
  protodep up --use-https
  link_proto_files "${SYNC_ROOT}/${SYNC_SHARED_DST_DIR}" "${SYNC_SHARED_PATHS}" "${SHARED_PACKAGE_NAMESPACE}"
)

echo ""
echo "Fill sync log was saved to:"
echo "  ${SYNC_LOG}"
