#!/bin/bash

set -euo pipefail

# Create changeset files for npm packages in monorepos
# This script can be used in two ways:
#   1. Called by update-deps.sh as part of the automated workflow
#   2. Called standalone with --check-changes to only create if changes exist from main

# Resolve this script's directory, following symlinks to the real path
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

# Optional pretty messages if helpers are available
if [ -f "$SCRIPT_DIR/helpers.sh" ]; then
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/helpers.sh"
else
  msg_info()    { printf "%s\n" "$*"; }
  msg_success() { printf "%s\n" "$*"; }
  msg_warn()    { printf "%s\n" "$*"; }
  msg_error()   { printf "%s\n" "$*" 1>&2; }
fi

usage() {
  cat <<'USAGE_CREATE_CHANGESET'
Usage: create-changeset.sh [--branch <branch>] [--check-changes]

Create a changeset file for the current repository, listing all packages with patch version.

Flags:
  --branch           Branch name to use in changeset filename (defaults to current branch)
  --check-changes    Only create changeset if there are changes from main branch

Examples:
  ./create-changeset.sh --branch feat/deps
  ./create-changeset.sh --check-changes
USAGE_CREATE_CHANGESET
}

# Defaults
BRANCH=""
CHECK_CHANGES="false"

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --check-changes)
      CHECK_CHANGES="true"
      shift
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      msg_error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# Main function to create changeset
create_changeset() {
  # If no branch provided, use current branch
  if [[ -z "$BRANCH" ]]; then
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
  fi

  # If check-changes is enabled, verify there are changes from main
  if [[ "$CHECK_CHANGES" == "true" ]]; then
    if git diff main --quiet && git diff --cached --quiet; then
      msg_info "No changes from main branch. Skipping changeset creation."
      return 0
    fi
    msg_info "Changes detected from main branch. Creating changeset..."
  fi

  # Check that .changeset directory exists
  if [ ! -d ".changeset" ]; then
    msg_error "ERROR: .changeset directory not found in current directory."
    msg_error "Please ensure the repository has a .changeset directory before creating changesets."
    return 1
  fi

  # Check if changeset already exists with non-empty content
  CHANGESET_FILE=".changeset/$BRANCH.md"
  if [ -f "$CHANGESET_FILE" ]; then
    # Check if file has meaningful content (more than just the template structure)
    if grep -q '^".*": patch$' "$CHANGESET_FILE"; then
      msg_info "Changeset already exists with valid content: $CHANGESET_FILE"
      return 0
    fi
  fi

  # Check if .changeset is empty (excluding .gitkeep and config files)
  if [ -n "$(find .changeset -mindepth 1 -maxdepth 1 ! -name '.gitkeep' ! -name 'README.md' ! -name 'config.json' ! -name 'config.yaml' 2>/dev/null)" ]; then
    msg_info "Changeset directory already contains files. Skipping auto-generation."
    return 0
  fi

  msg_info "Generating changeset for all packages..."
  
  # Get root package name
  ROOT_NAME=$(node -p "try{require('./package.json').name ?? ''}catch(e){''}" 2>/dev/null || true)
  
  # Get all workspace package names
  PKG_NAMES=$(pnpm -r --silent exec node -p "try{require('./package.json').name ?? ''}catch(e){''}" 2>/dev/null || true)
  
  # Combine and deduplicate
  ALL_NAMES=$(printf "%s\n%s\n" "$ROOT_NAME" "$PKG_NAMES" | \
    sed -e 's/^[[:space:]]*//;s/[[:space:]]*$//' -e '/^$/d' -e '/^undefined$/d' -e '/^null$/d' | \
    sort -u)
  
  if [ -z "$ALL_NAMES" ]; then
    msg_warn "No packages found for changeset."
    return 0
  fi

  # Create changeset file
  {
    echo '---'
    while IFS= read -r name; do
      if [ -n "$name" ] && [ "$name" != "undefined" ] && [ "$name" != "null" ]; then
        printf '"%s": patch\n' "$name"
      fi
    done <<< "$ALL_NAMES"
    echo '---'
    echo ''
    echo 'technical release'
  } > "$CHANGESET_FILE"

  # Verify last entry format is "...": patch and fix if necessary
  LAST_ENTRY=$(awk 'flag{ if($0~/---/){exit}; if($0!=""){print} } $0~/---/{flag=1}' "$CHANGESET_FILE" | tail -n 1)
  
  if [[ -z "$LAST_ENTRY" || ! "$LAST_ENTRY" =~ ^\".+\":\ patch$ ]]; then
    msg_warn "Invalid last changeset entry: '$LAST_ENTRY'. Attempting to correct..."
    GOOD_ENTRIES=$(awk 'flag{ if($0~/---/){exit}; if($0 ~ /^[\t ]*\".*\": patch[\t ]*$/){print} } $0~/---/{flag=1}' "$CHANGESET_FILE")
    
    if [[ -z "$GOOD_ENTRIES" ]]; then
      msg_warn "No valid changeset entries found; removing $CHANGESET_FILE"
      rm -f "$CHANGESET_FILE"
      return 1
    else
      {
        echo '---'
        printf "%s\n" "$GOOD_ENTRIES"
        echo '---'
        echo ''
        echo 'technical release'
      } > "$CHANGESET_FILE"
      msg_success "Changeset corrected in $CHANGESET_FILE"
    fi
  else
    msg_success "Changeset created: $CHANGESET_FILE"
  fi
}

create_changeset

