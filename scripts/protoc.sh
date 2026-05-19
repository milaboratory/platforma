#!/usr/bin/env bash
#
# Pinned protoc wrapper. Downloads the required version on first run,
# caches in ~/.cache/pl-protoc/<version>/, then execs protoc with all args.
#
set -euo pipefail

PROTOC_VERSION="29.3"
CACHE_DIR="${HOME}/.cache/pl-protoc/${PROTOC_VERSION}"
PROTOC_BIN="${CACHE_DIR}/bin/protoc"

if [ ! -x "${PROTOC_BIN}" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64)  protoc_arch="osx-aarch_64" ;;
    Darwin-x86_64) protoc_arch="osx-x86_64" ;;
    Linux-x86_64)  protoc_arch="linux-x86_64" ;;
    Linux-aarch64) protoc_arch="linux-aarch_64" ;;
    *) echo "ERROR: unsupported platform $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac

  protoc_zip="protoc-${PROTOC_VERSION}-${protoc_arch}.zip"
  protoc_url="https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOC_VERSION}/${protoc_zip}"
  tmp_dir="$(mktemp -d)"

  echo "protoc.sh: downloading protoc v${PROTOC_VERSION}..." >&2
  curl --silent --location --fail --output "${tmp_dir}/${protoc_zip}" "${protoc_url}"
  mkdir -p "${CACHE_DIR}"
  unzip -o -q "${tmp_dir}/${protoc_zip}" -d "${CACHE_DIR}" bin/protoc 'include/*'
  chmod +x "${PROTOC_BIN}"
  rm -rf "${tmp_dir}"
  echo "protoc.sh: installed to ${CACHE_DIR}" >&2
fi

exec "${PROTOC_BIN}" "--proto_path=${CACHE_DIR}/include" "$@"
