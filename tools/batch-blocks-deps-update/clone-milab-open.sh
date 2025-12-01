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
Usage: clone-milab-open.sh [org_name]

Clone or update repositories from a GitHub organization.

Arguments:
  org_name                 GitHub organization name (default: platforma-open)

Examples:
  ./clone-milab-open.sh
  ./clone-milab-open.sh my-org
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  usage
  exit 0
fi

ORG_NAME=${1:-platforma-open}

if [ -z "$ORG_NAME" ]; then
   echo "Usage: $0 [org_name] <folder_prefix>"
   exit 1
fi

echo "Fetching repositories from $ORG_NAME..."

# Files to record status during clone/update
OTHER_BRANCH_FILE="$(pwd)/repos-other-branch.txt"      # repos where 'main' was not available
STASHED_REPOS_FILE="$(pwd)/repos-with-stash.txt"       # repos where we auto-stashed local changes

# Reset the files at the start of the run
: > "$OTHER_BRANCH_FILE"
: > "$STASHED_REPOS_FILE"

gh repo list "$ORG_NAME" --limit 1000 --json name,nameWithOwner -q '.[] | {name, nameWithOwner}' |
    jq -r '.name + " " + .nameWithOwner' |
    while read -r repo_name repo_full; do
        target_dir="${repo_name}"

        if [ -d "$target_dir/.git" ]; then
            msg_info "Repository exists. Updating $target_dir..."
            (
                cd "$target_dir" || exit 1
                if [[ -n "$(git status --porcelain)" ]]; then
                    msg_info "Stashing local changes in $target_dir..."
                    git stash push -u -m "auto-stash before update" || true
                    # Record that we created a stash for this repo
                    echo "$target_dir" >> "$STASHED_REPOS_FILE"
                fi
                if ! git checkout main; then
                    msg_error "Branch 'main' not found in $target_dir; staying on current branch."
                    # Record repos where 'main' is not present
                    echo "$target_dir" >> "$OTHER_BRANCH_FILE"
                fi
                git pull --rebase
            )
        else
            msg_info "Cloning $repo_full into $target_dir..."
            gh repo clone "$repo_full" "$target_dir"
        fi

        if [ -d "$target_dir" ]; then
            if [ -f "$target_dir/package.json" ]; then
                if ! pushd "$target_dir" >/dev/null; then
                    msg_error "Failed to cd into $target_dir"
                    continue
                fi
                pnpm i || msg_error "Could not install dependencies in $target_dir"
                popd >/dev/null || true
            else
                msg_info "No package.json found in $target_dir, skipping pnpm install"
            fi
        else
            msg_error "Repository directory '$target_dir' does not exist, skipping pnpm install"
        fi
    done

msg_success "✅ Operation completed."
