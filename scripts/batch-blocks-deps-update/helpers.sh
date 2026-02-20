#!/bin/bash

# Message helpers with TTY-aware coloring

# Respect NO_COLOR; enable colors only on TTY
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  RED="\033[31m"
  GREEN="\033[32m"
  YELLOW="\033[33m"
  BLUE="\033[34m"
  BOLD="\033[1m"
  RESET="\033[0m"
else
  RED=""
  GREEN=""
  YELLOW=""
  BLUE=""
  BOLD=""
  RESET=""
fi

msg_info() {
  # Usage: msg_info "Fetching repositories..."
  printf "%b\n" "${BLUE}ℹ️  $*${RESET}"
}

msg_success() {
  # Usage: msg_success "Done."
  printf "%b\n" "${GREEN}✅ $*${RESET}"
}

msg_warn() {
  # Usage: msg_warn "Skipping repo..."
  printf "%b\n" "${YELLOW}⚠️  $*${RESET}"
}

msg_error() {
  # Usage: msg_error "Something went wrong"
  #        msg_error -x 2 "Fatal error, exiting with code 2"
  local exit_code=""
  if [[ "${1:-}" == "-x" || "${1:-}" == "--exit" ]]; then
    exit_code="${2:-1}"
    shift 2
  fi
  printf "%b\n" "${RED}❌ $*${RESET}" 1>&2
  if [[ -n "$exit_code" ]]; then
    exit "$exit_code"
  fi
}

die() {
  # Usage: die "fatal message"  OR  die 2 "fatal message"
  local code=1
  if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
    code="$1"
    shift
  fi
  msg_error -x "$code" "$@"
}

