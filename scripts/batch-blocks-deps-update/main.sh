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
  cat <<'USAGE'
Usage:
  mil <command> [args]

Commands:
  help [command]                Show general help or help for a command
  start                         Clone/update repos (see: main.sh help clone)
  finish                        Restore stashed changes from clone updates
  changes-prepare                Prepare changes (see: main.sh help manage)
  changes-apply                  Apply changes and open PRs (see: main.sh help manage)
  replace                       Search & replace (see: main.sh help replace)
  update-deps                   Update package versions across repos interactively
  install [--dest DIR]          Install commands to a bin directory (symlinks by default)

Notes:
  - For detailed flags and examples, run: mil help <command>
  - Detailed usage is provided by each command script.
USAGE
}

CMD="${1:-help}"
if [[ $# -gt 0 ]]; then
  shift || true
fi

# Defaults
ORG="platforma-open"
PREFIX=""
BRANCH=""
COMMIT_MSG=""
AUTO_MERGE="false"
REGEX_PATTERN=""
REPLACEMENT=""
DEST_DIR=""
INSTALL_MODE="link" # link | copy
PACKAGES_ARG="" # values for -p/--package (can be repeated or comma/space/newline separated)

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)
      ORG="${2:-}"
      shift 2
      ;;
    --prefix)
      PREFIX="${2:-}"
      shift 2
      ;;
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
    --regex)
      REGEX_PATTERN="${2:-}"
      shift 2
      ;;
    --replacement)
      REPLACEMENT="${2:-}"
      shift 2
      ;;
    --dest)
      DEST_DIR="${2:-}"
      shift 2
      ;;
    --link)
      INSTALL_MODE="link"
      shift
      ;;
    --copy)
      INSTALL_MODE="copy"
      shift
      ;;
    -p|--package)
      PK="${2:-}"
      [[ -n "$PK" ]] || { msg_error "--package requires a value"; exit 1; }
      if [[ -z "$PACKAGES_ARG" ]]; then PACKAGES_ARG="$PK"; else PACKAGES_ARG+=" $PK"; fi
      shift 2
      ;;
    -p=*)
      PK="${1#*=}"
      if [[ -z "$PACKAGES_ARG" ]]; then PACKAGES_ARG="$PK"; else PACKAGES_ARG+=" $PK"; fi
      shift
      ;;
    -h|--help)
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

 

case "$CMD" in
  help)
    # Support: main.sh help <command>
    if [[ -n "${1:-}" ]]; then
      SUB="$1"; shift || true
      case "$SUB" in
        clone)
          "$SCRIPT_DIR/clone-milab-open.sh" --help || true
          ;;
        manage|manage-repo|manage-prepare|manage-apply)
          "$SCRIPT_DIR/manage-repo.sh" --help || true
          ;;
        restore)
          "$SCRIPT_DIR/restore-stash.sh" --help || true
          ;;
        replace)
          "$SCRIPT_DIR/replace_deps.sh" --help || true
          ;;
        update-deps)
          "$SCRIPT_DIR/update-deps.sh" --help || true
          ;;
        all)
          usage
          ;;
        *)
          msg_error "Unknown subcommand for help: $SUB"
          usage
          exit 1
          ;;
      esac
    else
      usage
    fi
    ;;

  start)
    msg_info "Cloning/updating repositories from org '$ORG'..."
    "$SCRIPT_DIR/clone-milab-open.sh" "$ORG"
    msg_success "Done."
    ;;

  finish)
    # If PREFIX is provided, pass it to the restore script to scope repos
    if [[ -n "$PREFIX" ]]; then
      msg_info "Restoring stashes for repos with prefix '$PREFIX'..."
      "$SCRIPT_DIR/restore-stash.sh" "$PREFIX"
    else
      msg_info "Restoring stashes for all repos in current directory..."
      "$SCRIPT_DIR/restore-stash.sh"
    fi
    ;;

  changes-prepare)
    [[ -n "$BRANCH" ]] || { msg_error "--branch is required"; exit 1; }
    [[ -n "$PREFIX" ]] || { msg_error "--prefix is required"; exit 1; }
    msg_info "Preparing changes on branch '$BRANCH' for repos with prefix '$PREFIX'..."
    # Note: manage-repo.sh expects an unused third positional arg for prepare-changes
    mapfile -t _ARGS < <(manage_args_with_flag "$SCRIPT_DIR/manage-repo.sh" prepare-changes "$BRANCH" "-" "$PREFIX")
    "${_ARGS[@]}"
    msg_success "Preparation completed."
    ;;

  changes-apply)
    [[ -n "$BRANCH" ]] || { msg_error "--branch is required"; exit 1; }
    [[ -n "$COMMIT_MSG" ]] || { msg_error "--commit is required"; exit 1; }
    [[ -n "$PREFIX" ]] || { msg_error "--prefix is required"; exit 1; }
    msg_info "Applying changes and creating PRs for repos with prefix '$PREFIX'..."
    mapfile -t _ARGS < <(manage_args_with_flag "$SCRIPT_DIR/manage-repo.sh" apply-changes "$BRANCH" "$COMMIT_MSG" "$PREFIX")
    "${_ARGS[@]}"
    msg_success "Apply completed."
    ;;

  replace)
    [[ -n "$REGEX_PATTERN" ]] || { msg_error "--regex is required"; exit 1; }
    [[ -n "$REPLACEMENT" ]] || { msg_error "--replacement is required"; exit 1; }
    [[ -n "$PREFIX" ]] || { msg_error "--prefix is required"; exit 1; }
    msg_info "Running search & replace in repos with prefix '$PREFIX'..."
    "$SCRIPT_DIR/replace_deps.sh" "$REGEX_PATTERN" "$REPLACEMENT" "$PREFIX"
    msg_success "Replace completed."
    ;;

  update-deps)
    BRANCH="$BRANCH" COMMIT_MSG="$COMMIT_MSG" AUTO_MERGE="$AUTO_MERGE" PACKAGES_ARG="$PACKAGES_ARG" "$SCRIPT_DIR/update-deps.sh"
    ;;

  install)
    # Determine destination directory
    if [[ -z "$DEST_DIR" ]]; then
      DEST_DIR="$HOME/.local/bin"
    fi
    mkdir -p "$DEST_DIR"

    msg_info "Installing commands into '$DEST_DIR' (mode: $INSTALL_MODE)..."

    # Ensure sources are executable
    chmod +x "$SCRIPT_DIR/main.sh" || true
    [[ -f "$SCRIPT_DIR/clone-milab-open.sh" ]] && chmod +x "$SCRIPT_DIR/clone-milab-open.sh" || true
    [[ -f "$SCRIPT_DIR/manage-repo.sh" ]] && chmod +x "$SCRIPT_DIR/manage-repo.sh" || true
    [[ -f "$SCRIPT_DIR/replace_deps.sh" ]] && chmod +x "$SCRIPT_DIR/replace_deps.sh" || true
    [[ -f "$SCRIPT_DIR/restore-stash.sh" ]] && chmod +x "$SCRIPT_DIR/restore-stash.sh" || true
    [[ -f "$SCRIPT_DIR/update-deps.sh" ]] && chmod +x "$SCRIPT_DIR/update-deps.sh" || true

    # Map of source -> target name
    declare -a _srcs=(
      "$SCRIPT_DIR/main.sh|mil"
      "$SCRIPT_DIR/clone-milab-open.sh|mil-clone"
      "$SCRIPT_DIR/manage-repo.sh|mil-manage"
      "$SCRIPT_DIR/replace_deps.sh|mil-replace"
      "$SCRIPT_DIR/restore-stash.sh|mil-restore"
      "$SCRIPT_DIR/update-deps.sh|mil-update-deps"
    )

    for entry in "${_srcs[@]}"; do
      IFS='|' read -r src name <<<"$entry"
      [[ -f "$src" ]] || { msg_warn "Skipping missing source: $src"; continue; }
      dest="$DEST_DIR/$name"
      if [[ "$INSTALL_MODE" == "link" ]]; then
        ln -sfn "$src" "$dest"
      else
        cp -f "$src" "$dest"
      fi
      msg_success "Installed $name -> $dest"
    done

    # Check PATH inclusion
    case ":$PATH:" in
      *":$DEST_DIR:"*) IN_PATH=true ;;
      *) IN_PATH=false ;;
    esac

    if [[ "$IN_PATH" != true ]]; then
      msg_warn "'$DEST_DIR' is not in your PATH. Add it for your shell:"
      printf "\n"
      echo "zsh (~/.zshrc):"
      echo "  export PATH=\"$DEST_DIR:\$PATH\""
      printf "\n"
      echo "bash (~/.bashrc or ~/.bash_profile on macOS):"
      echo "  export PATH=\"$DEST_DIR:\$PATH\""
      printf "\n"
      echo "fish (one-time command):"
      echo "  fish -c 'set -Ux fish_user_paths $DEST_DIR $fish_user_paths'"
      printf "\n"
      msg_info "After updating PATH, restart your shell or source the config file."
    else
      msg_success "'$DEST_DIR' is in PATH. You can now run: mil"
    fi
    ;;

  *)
    msg_error "Unknown command: $CMD"
    usage
    exit 1
    ;;
esac


