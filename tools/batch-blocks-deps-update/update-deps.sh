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

# Read branch from update-deps.txt if not provided and file exists
if [[ -z "$BRANCH" ]]; then
  UPDATE_DEPS_FILE="$(pwd)/update-deps.txt"
  if [[ -f "$UPDATE_DEPS_FILE" ]]; then
    # Extract branch name from branch=branch_name format
    if grep -q "^branch=" "$UPDATE_DEPS_FILE"; then
      BRANCH=$(grep "^branch=" "$UPDATE_DEPS_FILE" | cut -d'=' -f2-)
      msg_info "Using branch from update-deps.txt: $BRANCH"
    fi
  fi
fi

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

  # File to track all created PRs (named after the branch)
  PRS_FILE="${SCRIPT_DIR}/${BRANCH}.txt"
  
  # Function to add PR to file without duplicates
  add_pr_to_file() {
    local pr_entry="$1"
    local pr_url
    pr_url=$(echo "$pr_entry" | sed -n 's/.*\(https:\/\/[^ ]*\).*/\1/p')
    
    # Create file if it doesn't exist
    [[ -f "$PRS_FILE" ]] || touch "$PRS_FILE"
    
    # Check if PR URL already exists in file
    if [[ -n "$pr_url" ]] && grep -qF "$pr_url" "$PRS_FILE"; then
      msg_info "PR already tracked in file: $pr_url"
      return 0
    fi
    
    # Add new PR entry with timestamp
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    printf "[%s] %s\n" "$timestamp" "$pr_entry" >> "$PRS_FILE"
    msg_info "Added PR to tracking file: $pr_entry"
  }

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
    if git diff main --name-only | grep -Eq '(package.json$|pnpm-workspace\.ya?ml$)'; then
      pnpm install --no-frozen-lockfile || msg_warn "pnpm install failed in $DIR"
    fi

    # Commit and create PR if there are changes
    if git diff main --quiet && git diff --cached --quiet; then
      msg_info "No changes to commit in $DIR. Skipping."
      popd >/dev/null
      continue
    fi

    # Before PR creation: ensure pnpm install is always run and .changeset exists
    msg_info "Running pnpm install to ensure dependencies are up to date..."
    pnpm install || msg_warn "pnpm install failed in $DIR"
    
    # Check that .changeset directory exists before creating PR
    if [ ! -d ".changeset" ]; then
      msg_error "ERROR: .changeset directory not found in $DIR. Skipping PR creation."
      msg_error "Please ensure the repository has a .changeset directory before creating PRs."
      popd >/dev/null
      continue
    fi

    # Create changeset using the dedicated script
    "$SCRIPT_DIR/create-changeset.sh" --branch "$BRANCH" || msg_warn "Changeset creation failed in $DIR"

    git add .
    git commit -m "$COMMIT_MSG" || true
    if ! git diff --cached --quiet; then
      # Something remained staged without commit (defensive)
      git commit -m "$COMMIT_MSG" || true
    fi
    # If still no commit (nothing changed), skip
    if git log -1 --pretty=%B | grep -qF "$COMMIT_MSG"; then
      git push -u origin "$BRANCH" || msg_warn "Push failed for $DIR"
      
      # Check if branch is different from main
      CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
      if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" == "$BRANCH" ]]; then
        # Check if PR already exists first
        set +e
        EXISTING_PR=$(gh pr view --head "$BRANCH" --base main --json url,body --jq '.url' 2>/dev/null)
        EXISTING_PR_BODY=$(gh pr view --head "$BRANCH" --base main --json body --jq '.body' 2>/dev/null)
        EXISTING_PR_EXIT=$?
        set -e
        
        if [[ "$EXISTING_PR_EXIT" -eq 0 && -n "$EXISTING_PR" ]]; then
          # PR already exists
          msg_info "PR already exists: $EXISTING_PR"
          local pr_entry="$(basename "$DIR"): $EXISTING_PR"
          CREATED_PRS+=("$pr_entry")
          add_pr_to_file "$pr_entry"
          if [[ -n "$EXISTING_PR_BODY" ]]; then
            msg_info "PR template/body:"
            echo "$EXISTING_PR_BODY"
          fi
          if [[ "$AUTO_MERGE" == "true" ]]; then
            gh pr merge --merge --auto || msg_warn "Auto-merge failed or not applicable."
          fi
        else
          # No existing PR, create one
          set +e
          PR_URL=$(gh pr create --title "$BRANCH" --body "$COMMIT_MSG" --head "$BRANCH" --base main 2>&1)
          PR_EXIT=$?
          set -e
          if [[ "$PR_EXIT" -eq 0 && -n "$PR_URL" ]]; then
            msg_success "PR created: $PR_URL"
            local pr_entry="$(basename "$DIR"): $PR_URL"
            CREATED_PRS+=("$pr_entry")
            add_pr_to_file "$pr_entry"
            if [[ "$AUTO_MERGE" == "true" ]]; then
              gh pr merge --merge --auto || msg_warn "Auto-merge failed or not applicable."
            fi
          else
            # Check if failure was due to existing PR by parsing error message
            if [[ "$PR_URL" =~ https://github\.com/[^[:space:]]+ ]]; then
              EXTRACTED_URL="${BASH_REMATCH[0]}"
              msg_info "PR already exists (detected from error): $EXTRACTED_URL"
              local pr_entry="$(basename "$DIR"): $EXTRACTED_URL"
              CREATED_PRS+=("$pr_entry")
              add_pr_to_file "$pr_entry"
              if [[ "$AUTO_MERGE" == "true" ]]; then
                gh pr merge --merge --auto || msg_warn "Auto-merge failed or not applicable."
              fi
            else
              msg_warn "PR creation failed for $DIR: $PR_URL"
            fi
          fi
        fi
      else
        msg_info "Skipping PR creation - branch is main or doesn't match expected branch"
      fi
    else
      msg_info "Nothing to commit in $DIR after replacements."
    fi

    popd >/dev/null
  done

  # Summary
  if [[ "${#CREATED_PRS[@]}" -gt 0 ]]; then
    echo "${CREATED_PRS[@]}" | tee "$PRS_FILE" > /dev/null
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


