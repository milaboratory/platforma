#!/usr/bin/env bash
# Refresh table_component.wasm from the canonical source at
# milaboratory/pl:fixtures/wasm-test-fixture/. Copies the committed
# binary verbatim — no Cargo, no build step.
#
# By default the script does a shallow clone of pl@main into a tmp dir
# (sparse-checking out only the fixture path) and copies the .wasm. For
# local-workspace iteration point FIXTURE_WASM at a checked-out file to
# skip the clone entirely.

set -o nounset
set -o errexit
set -o pipefail

script_dir=$(cd "$(dirname "${0}")" && pwd)

#
# Configuration
#

: "${SYNC_ORIGIN:="git@github.com:milaboratory/pl.git"}"
: "${SYNC_ORIGIN_REF:="main"}"
: "${SYNC_FIXTURE_PATH:="fixtures/wasm-test-fixture/table_component.wasm"}"
: "${FIXTURE_WASM:=""}"
: "${OUTPUT_FILE:="${script_dir}/table_component.wasm"}"
: "${SYNC_LOG:="${script_dir}/sync-wasm-fixture.log"}"

#
# Function definitions
#

function log() {
    printf -- "%s\n" "${*}" | tee -a "${SYNC_LOG}"
}

function cleanup() {
    local _tmp="${1}"
    log "Removing tmp clone at ${_tmp}"
    rm -rf "${_tmp}"
    trap 'true' EXIT
}

#
# Run
#

rm -f "${SYNC_LOG}"

if [[ -n "${FIXTURE_WASM}" ]]; then
    log "Using local FIXTURE_WASM=${FIXTURE_WASM}"
else
    tmp_dir="$(mktemp -d -t wasm-fixture-sync-XXXXXX)"
    trap "cleanup '${tmp_dir}'" EXIT

    log "Cloning '${SYNC_ORIGIN}@${SYNC_ORIGIN_REF}' (shallow, sparse) into ${tmp_dir}"
    git clone \
        --depth 1 \
        --single-branch \
        --branch "${SYNC_ORIGIN_REF}" \
        --filter=blob:none \
        --sparse \
        "${SYNC_ORIGIN}" \
        "${tmp_dir}/pl" 2>&1 | tee -a "${SYNC_LOG}"

    (
        cd "${tmp_dir}/pl"
        git sparse-checkout set "$(dirname "${SYNC_FIXTURE_PATH}")"
    ) 2>&1 | tee -a "${SYNC_LOG}"

    FIXTURE_WASM="${tmp_dir}/pl/${SYNC_FIXTURE_PATH}"
fi

if [[ ! -f "${FIXTURE_WASM}" ]]; then
    log "ERROR: canonical fixture not found at ${FIXTURE_WASM}"
    exit 1
fi

cp "${FIXTURE_WASM}" "${OUTPUT_FILE}"

sha="$(shasum -a 256 "${OUTPUT_FILE}" | awk '{print $1}')"
size="$(wc -c < "${OUTPUT_FILE}" | tr -d ' ')"
log "==> Updated ${OUTPUT_FILE} (${size} bytes, sha256=${sha})"
log ""
log "Log saved at: ${SYNC_LOG}"
