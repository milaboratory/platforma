#!/bin/bash

set -e

usage() {
  cat <<'USAGE'
Usage:
  manage-repo.sh prepare-changes <branch-name> [--auto-merge]
  manage-repo.sh apply-changes <branch-name> <commit-message> [--auto-merge]

Prepare changes across all git repositories in the current directory, creating/switching branches.
Apply changes by committing, pushing, and opening PRs.

Arguments:
  <branch-name>              Branch to create/switch to
  <commit-message>           Commit/PR message (apply-changes)

Options:
  --auto-merge               Enable auto-merge for created PRs (requires gh)

Examples:
  ./manage-repo.sh prepare-changes chore/update --auto-merge
  ./manage-repo.sh apply-changes chore/update "Update deps" --auto-merge
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  usage
  exit 0
fi

ACTION=$1
BRANCH_NAME=$2
COMMIT_MSG=$3

# Parse optional flags
AUTO_MERGE=false
# Shift positional args depending on action
case "$ACTION" in
  prepare-changes)
    shift 2
    ;;
  apply-changes)
    shift 3
    ;;
  *)
    ;;
esac

while [[ $# -gt 0 ]]; do
  case $1 in
    --auto-merge)
      AUTO_MERGE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage:"
      echo "  $0 prepare-changes <branch-name> [--auto-merge]"
      echo "  $0 apply-changes <branch-name> <commit-message> [--auto-merge]"
      exit 1
      ;;
  esac
done

if [[ "$ACTION" != "prepare-changes" && "$ACTION" != "apply-changes" ]]; then
  usage
  exit 1
fi

# Initialize array to store created PRs
CREATED_PRS=()

REPOS=$(find . -maxdepth 1 -type d -not -name '.')

for DIR in $REPOS; do
  echo "🔍 Processing $DIR"
  cd "$DIR" || continue
  REPO_ABS_DIR=$(pwd -P)

  if [ ! -d ".git" ]; then
    echo "⚠️ Skipping $DIR — not a git repo"
    cd ..
    continue
  fi

  case "$ACTION" in

    prepare-changes)
      # Check for uncommitted changes
      if ! git diff --quiet || ! git diff --quiet; then
        echo "⚠️ Repo '$DIR' has changes."
        read -rp "Reset changes? (y/n): " confirm
        if [[ "$confirm" == "y" ]]; then
          git reset --hard
          git clean -fd
          echo "✅ Reset complete."
        else
          echo "⏭️ Skipping reset."
        fi
      fi

      echo "🔀 Creating and switching to branch '$BRANCH_NAME'"
      git checkout -B "$BRANCH_NAME"
      ;;

    apply-changes)
      CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
      if [[ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]]; then
        echo "❌ Not on branch $BRANCH_NAME. Skipping."
        cd ..
        continue
      fi

      # Check for changes to commit
      if git diff --quiet && git diff --quiet; then
        echo "✅ No changes to commit in $DIR. Skipping."
        cd ..
        continue
      fi

      echo "💾 Changes detected. Staging and showing diff..."
      pnpm i || exit 1
      git diff 

      read -rp "📋 Proceed with commit and PR creation? (y/n): " confirm_commit
      if [[ "$confirm_commit" != "y" ]]; then
        echo "⏭️ Skipping commit and PR for $DIR"
        cd ..
        continue
      fi

      # Auto-generate a changeset for all packages if .changeset exists
      if [ -d ".changeset" ]; then
        echo "📝 Generating changeset for all packages..."
        # Collect package names from root and all workspace packages
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
          echo "✅ Changeset written to $CHANGESET_FILE"
        else
          echo "⚠️ No packages found for changeset."
        fi
      else
        echo "ℹ️ No .changeset directory; skipping changeset generation."
      fi

      git add .
      git commit -m "$COMMIT_MSG"
      git push -u origin "$BRANCH_NAME"

      echo "🚀 Creating PR via gh..."
      set +e
      PR_URL=$(gh pr create --title "$COMMIT_MSG" --body "$COMMIT_MSG" --head "$BRANCH_NAME" --base main --json url --jq '.url')
      PR_EXIT=$?
      set -e

      if [[ "$PR_EXIT" -eq 0 && -n "$PR_URL" ]]; then
        echo "✅ PR created: $PR_URL"
        CREATED_PRS+=("$(basename "$DIR"): $PR_URL")
      else
        echo "⚠️ PR creation failed or PR may already exist."
        TITLE_ESCAPED=$(printf '%q' "$COMMIT_MSG")
        BODY_ESCAPED=$(printf '%q' "$COMMIT_MSG")
        HEAD_ESCAPED=$(printf '%q' "$BRANCH_NAME")
        REPO_ESCAPED=$(printf '%q' "$REPO_ABS_DIR")
        echo "🔁 To reproduce, run:"
        echo "    cd $REPO_ESCAPED && gh pr create --title $TITLE_ESCAPED --body $BODY_ESCAPED --head $HEAD_ESCAPED --base main"
        exit 1
      fi

      if [[ "$AUTO_MERGE" == "true" ]]; then
        echo "🤖 Enabling auto-merge for PR..."
        gh pr merge --merge --auto || echo "⚠️ Auto-merge failed or not applicable."
      fi
      ;;

  esac

  cd ..
done

echo "🏁 Done processing all repositories."

# Display list of created PRs
if [[ "${#CREATED_PRS[@]}" -gt 0 ]]; then
  echo ""
  echo "📋 Created Pull Requests:"
  echo "=========================="
  for pr in "${CREATED_PRS[@]}"; do
    echo "• $pr"
  done
  echo ""
else
  echo ""
  echo "📋 No new PRs were created."
  echo ""
fi
