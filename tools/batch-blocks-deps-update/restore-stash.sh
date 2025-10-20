#!/bin/bash

# Ensure helpers are sourced relative to this script real location (follow symlinks)
resolve_script_dir() {
  local source="${BASH_SOURCE[0]}"
  while [ -h "$source" ]; do
    local dir
    dir="$(cd -P "$(dirname "$source")" && pwd)"
    source="$(readlink "$source")"
    [[ "$source" != /* ]] && source="$dir/$source"
  done
  cd -P "$(dirname "$source")" && pwd
}

SCRIPT_DIR="$(resolve_script_dir)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/helpers.sh"

usage() {
  cat <<'USAGE'
Usage: restore-stash.sh [repo_prefix]

Restore (pop) stashes created during clone updates across repositories.

Arguments:
  repo_prefix              Optional folder prefix to target repos, e.g., acme-

Behavior:
  - If `repos-with-stash.txt` exists in current directory, uses it as the
    authoritative list of repos to restore (one path per line). Otherwise,
    scans directories.
  - Looks for stash entries with message containing: "auto-stash before update"
  - Runs `git stash pop <stash@{N}>` for the first matching entry per repo
  - Continues on conflicts/errors, reporting a warning per repo

Examples:
  ./restore-stash.sh
  ./restore-stash.sh acme-
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  usage
  exit 0
fi

REPO_PREFIX=${1:-}

LIST_FILE="$(pwd)/repos-with-stash.txt"

# Build list of repositories to process
if [[ -f "$LIST_FILE" ]]; then
  # Use recorded repos with stashes
  if [[ -n "$REPO_PREFIX" ]]; then
    REPOS=$(grep -E "^\./?${REPO_PREFIX}[^/]*$|^${REPO_PREFIX}[^/]*$" "$LIST_FILE" || true)
  else
    REPOS=$(cat "$LIST_FILE")
  fi
else
  # Fallback: scan directory
  if [[ -n "$REPO_PREFIX" ]]; then
    REPOS=$(find . -maxdepth 1 -type d -name "${REPO_PREFIX}*" -not -name '.')
  else
    REPOS=$(find . -maxdepth 1 -type d -not -name '.')
  fi
fi

TOTAL=0
RESTORED=0
SKIPPED=0

for DIR in $REPOS; do
  # Normalize entries from list file to local path form
  DIR=${DIR#./}
  TOTAL=$((TOTAL + 1))
  if [ ! -d "$DIR/.git" ]; then
    msg_warn "Skipping $DIR — not a git repo"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  msg_info "Processing $DIR"
  cd "$DIR" || { msg_warn "Cannot enter $DIR"; SKIPPED=$((SKIPPED + 1)); continue; }

  # Find first stash ref with our marker message
  STASH_REF=$(git stash list --pretty="%gd %s" | grep -m1 "auto-stash before update" | awk '{print $1}')

  if [[ -z "$STASH_REF" ]]; then
    msg_info "No matching auto-stash found"
    SKIPPED=$((SKIPPED + 1))
    cd .. || true
    continue
  fi

  msg_info "Restoring $STASH_REF"
  if git stash pop "$STASH_REF"; then
    msg_success "Restored stash in $(basename "$DIR")"
    RESTORED=$((RESTORED + 1))
  else
    msg_warn "Stash pop produced conflicts or failed in $(basename "$DIR"). Resolve manually."
  fi

  cd .. || true
done

msg_success "Done. Repos scanned: $TOTAL, restored: $RESTORED, skipped: $SKIPPED"


