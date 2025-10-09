#!/bin/bash

set -euo pipefail

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
  cat <<'USAGE_UPDATE_DEPS'
Usage: update-deps.sh [--branch <branch>] [--commit <message>] [--auto-merge] \
                      [-p|--package <name>]... [--package=<list>]

Update specified npm packages to their latest versions across all repos
in the current directory. This will:
  1) Validate packages exist in the npm registry and fetch latest versions
  2) Prepare repos/branches (changes-prepare)
  3) Force replace versions in package.json files
  4) Run pnpm install in each repo to update lockfiles
  5) Apply changes and open PRs (changes-apply)

Required:
  -p, --package   One or more package names. Option may be repeated.
                  Values can be space/comma/newline-separated (e.g.
                  -p "react,react-dom" -p @types/node).

Flags:
  --branch        Branch name to create/switch for changes (optional)
  --commit        Commit/PR message (optional)
  --auto-merge    Enable auto-merge for created PRs
  --package=LIST  Alternative to -p: comma/space/newline-separated list

Defaults:
  --branch        Defaults to current date: YYYY-MM-DD-deps-update-HH
  --commit        Defaults to: "dependencies update"

Examples:
  ./update-deps.sh -p react -p react-dom
  ./update-deps.sh --branch feat/deps --commit "deps: update" -p "react,react-dom @types/node"
USAGE_UPDATE_DEPS
}

# Defaults
BRANCH="${BRANCH:-}"
COMMIT_MSG="${COMMIT_MSG:-}"
AUTO_MERGE="${AUTO_MERGE:-false}"
PACKAGES_ARG="${PACKAGES_ARG:-}"

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --commit)
      COMMIT_MSG="${2:-}"
      shift 2
      ;;
    --auto-merge)
      AUTO_MERGE="true"
      shift
      ;;
    -p|--package)
      PK="${2:-}"
      [[ -n "$PK" ]] || { msg_error "--package requires a value"; exit 1; }
      if [[ -z "$PACKAGES_ARG" ]]; then PACKAGES_ARG="$PK"; else PACKAGES_ARG+=" $PK"; fi
      shift 2
      ;;
    --package=*)
      PK="${1#*=}"
      if [[ -z "$PACKAGES_ARG" ]]; then PACKAGES_ARG="$PK"; else PACKAGES_ARG+=" $PK"; fi
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

# Helpers to append optional flags
manage_args_with_flag() {
  local args=("$@")
  if [[ "$AUTO_MERGE" == "true" ]]; then
    args+=("--auto-merge")
  fi
  printf '%s\n' "${args[@]}"
}

# Update dependencies workflow
update_deps() {
  # Defaults if not provided
  if [[ -z "$BRANCH" ]]; then
    BRANCH="$(date +%Y-%m-%d)-deps-update-$(date +%H)"
  fi
  if [[ -z "$COMMIT_MSG" ]]; then
    COMMIT_MSG="dependencies update"
  fi

  # Determine packages list
  PACKAGES_INPUT=""
  if [[ -n "${PACKAGES_ARG:-}" ]]; then
    PACKAGES_INPUT="$PACKAGES_ARG"
  else
    msg_error "No packages provided"
    usage
    return 1
  fi
  [[ -n "$PACKAGES_INPUT" ]] || { msg_error "No packages provided"; return 1; }

  # Normalize separators to spaces
  PACKAGES_INPUT=${PACKAGES_INPUT//$'\n'/ } 
  PACKAGES_INPUT=${PACKAGES_INPUT//,/ } 

  # Build arrays of packages and resolved versions
  declare -a PKGS=()
  declare -a VERSIONS=()

  # Pick view tool
  local VIEW_TOOL=""
  if command -v pnpm >/dev/null 2>&1; then
    VIEW_TOOL="pnpm view"
  elif command -v npm >/dev/null 2>&1; then
    VIEW_TOOL="npm view"
  else
    msg_error "Neither pnpm nor npm is installed; cannot resolve package versions"
    return 1
  fi

  msg_info "Validating packages and fetching latest versions..."
  for token in $PACKAGES_INPUT; do
    local pkg="$token"
    pkg="${pkg## }"; pkg="${pkg%% }"
    [[ -n "$pkg" ]] || continue
    set +e
    local ver
    ver=$($VIEW_TOOL "$pkg" version 2>/dev/null)
    local rc=$?
    set -e
    if [[ $rc -ne 0 || -z "$ver" ]]; then
      msg_error "Package not found or no version available: $pkg"
      return 1
    fi
    PKGS+=("$pkg")
    VERSIONS+=("$ver")
    msg_success "$pkg -> $ver"
  done

  # Precompute regex/replacement pairs for packages
  declare -a REGEXES=()
  declare -a REPLACEMENTS=()
  if [[ ${#PKGS[@]} -gt 0 ]]; then
    for i in "${!PKGS[@]}"; do
      local pkg="${PKGS[$i]}"
      local ver="${VERSIONS[$i]}"
      # Only match when the current value looks like a version to avoid updating catalog/npm/github/workspace specs
      # Capture prefix up to value, optionally capture surrounding quotes, then replace value while preserving quotes
      local REGEX_PATTERN="(.$pkg.\\s*:\\s*)(['\"]?)[~^<>=*v0-9][^'\"\\n,]*(['\"]?)"
      local REPLACEMENT="\$1\$2^${ver}\$3"
      REGEXES+=("$REGEX_PATTERN")
      REPLACEMENTS+=("$REPLACEMENT")
      msg_success "$pkg -> ^$ver"
    done
  fi

  declare -a CREATED_PRS=()
  for DIR in $(find . -maxdepth 1 -type d -not -name '.'); do
    echo ""
    msg_info "🔍 Processing $DIR"
    if [[ ! -d "$DIR/.git" ]]; then
      msg_warn "Skipping $DIR — not a git repo"
      continue
    fi

    pushd "$DIR" >/dev/null

    # Ensure clean working tree; skip repos with local changes to avoid interactive prompts
    if ! git diff --quiet || ! git diff --cached --quiet; then
      msg_warn "Repo '$DIR' has uncommitted changes — skipping"
      popd >/dev/null
      continue
    fi

    # Create/switch branch
    git checkout -B "$BRANCH"

    # Perform replacements for each package within this repo
    if [[ ${#REGEXES[@]} -gt 0 ]]; then
      for i in "${!REGEXES[@]}"; do
        "$SCRIPT_DIR/replace_deps.sh" --force "${REGEXES[$i]}" "${REPLACEMENTS[$i]}"
      done
    fi

    # If dependency config changed, update lockfiles
    if git diff --name-only | grep -Eq '(package.json$|pnpm-workspace\.ya?ml$)'; then
      pnpm install || msg_warn "pnpm install failed in $DIR"
    fi

    # Commit and create PR if there are changes
    if git diff --quiet && git diff --cached --quiet; then
      msg_info "No changes to commit in $DIR. Skipping."
      popd >/dev/null
      continue
    fi

    # Auto-generate a changeset for all packages if .changeset exists
    if [ -d ".changeset" ]; then
      msg_info "Generating changeset for all packages..."
      ROOT_NAME=$(node -p "try{require('./package.json').name}catch(e){''}" 2>/dev/null || true)
      PKG_NAMES=$(pnpm -r --silent exec node -p "require('./package.json').name" 2>/dev/null || true)
      ALL_NAMES=$(printf "%s\n%s\n" "$ROOT_NAME" "$PKG_NAMES" | sed '/^$/d' | sort -u)
      if [ -n "$ALL_NAMES" ]; then
        CHANGESET_FILE=".changeset/auto-$(date +%Y%m%d%H%M%S).md"
        {
          echo '---'
          while IFS= read -r name; do
            printf '"%s": patch\n' "$name"
          done <<< "$ALL_NAMES"
          echo '---'
          echo ''
          echo 'technical release'
        } > "$CHANGESET_FILE"
        msg_success "Changeset written to $CHANGESET_FILE"
      else
        msg_warn "No packages found for changeset."
      fi
    fi

    git add .
    git commit -m "$COMMIT_MSG" || true
    if ! git diff --cached --quiet; then
      # Something remained staged without commit (defensive)
      git commit -m "$COMMIT_MSG" || true
    fi
    # If still no commit (nothing changed), skip
    if git log -1 --pretty=%B | grep -qF "$COMMIT_MSG"; then
      git push -u origin "$BRANCH" || msg_warn "Push failed for $DIR"
      set +e
      PR_URL=$(gh pr create --title "$COMMIT_MSG" --body "$COMMIT_MSG" --head "$BRANCH" --base main)
      PR_EXIT=$?
      set -e
      if [[ "$PR_EXIT" -eq 0 && -n "$PR_URL" ]]; then
        msg_success "PR created: $PR_URL"
        CREATED_PRS+=("$(basename "$DIR"): $PR_URL")
        if [[ "$AUTO_MERGE" == "true" ]]; then
          gh pr merge --merge --auto || msg_warn "Auto-merge failed or not applicable."
        fi
      else
        msg_warn "PR creation failed or PR may already exist for $DIR"
      fi
    else
      msg_info "Nothing to commit in $DIR after replacements."
    fi

    popd >/dev/null
  done

  # Summary
  if [[ "${#CREATED_PRS[@]}" -gt 0 ]]; then
    msg_success "\nCreated Pull Requests:"
    for pr in "${CREATED_PRS[@]}"; do
      printf "• %s\n" "$pr"
    done
  else
    msg_info "\nNo new PRs were created."
  fi

  msg_success "Update-deps workflow completed."
}

update_deps


