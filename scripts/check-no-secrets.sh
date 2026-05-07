#!/usr/bin/env bash
# Check staged files for hardcoded secrets, credentials, and internal identifiers.
# Use as a pre-commit hook or run standalone.
#
# Usage:
#   ./scripts/check-no-secrets.sh              # check staged files
#   ./scripts/check-no-secrets.sh --all        # check all tracked files
#   ./scripts/check-no-secrets.sh file1 file2  # check specific files
#
# Exit code: 0 if clean, 1 if secrets found.
#
# To install as pre-commit hook:
#   echo './scripts/check-no-secrets.sh' >> .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

set -euo pipefail

# --- Patterns to detect ---
# Each line: <regex> <description>
# Add new patterns here when new types of secrets need checking.
PATTERNS=(
    '\b[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\b|AWS ECR URL with account ID'
    '\b[0-9]{12}\b.*amazonaws|AWS account ID in AWS context'
    '\bE-[A-Z]{40,}\b|Platforma license key'
    '\b(AKIA|ASIA)[A-Z0-9]{16}\b|AWS access key ID'
    '\bghp_[A-Za-z0-9]{36}\b|GitHub personal access token'
    '\bgithub_pat_[A-Za-z0-9_]{80,}\b|GitHub fine-grained PAT'
    '\bsk-[A-Za-z0-9]{20,}\b|API secret key (generic)'
)

# --- Files to exclude ---
# These files legitimately contain patterns (e.g., regex definitions, test fixtures)
EXCLUDE_PATTERNS=(
    'check-no-secrets\.sh'    # this script itself
    '\.trivyignore'
    'pnpm-lock\.yaml'
    'package-lock\.json'
)

# --- Determine files to check ---
FILES=()
if [[ "${1:-}" == "--all" ]]; then
    while IFS= read -r f; do FILES+=("$f"); done < <(git ls-files)
elif [[ $# -gt 0 ]]; then
    FILES=("$@")
else
    while IFS= read -r f; do FILES+=("$f"); done < <(git diff --cached --name-only --diff-filter=ACMR)
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
    exit 0
fi

# Build exclude regex
EXCLUDE_RE=""
for pat in "${EXCLUDE_PATTERNS[@]}"; do
    if [[ -z "$EXCLUDE_RE" ]]; then
        EXCLUDE_RE="$pat"
    else
        EXCLUDE_RE="$EXCLUDE_RE|$pat"
    fi
done

FOUND=0

for entry in "${PATTERNS[@]}"; do
    REGEX="${entry%%|*}"
    DESC="${entry##*|}"

    for file in "${FILES[@]}"; do
        # Skip excluded files
        if echo "$file" | grep -qE "$EXCLUDE_RE"; then
            continue
        fi

        # Skip binary files
        if file "$file" 2>/dev/null | grep -q 'binary\|executable'; then
            continue
        fi

        [[ ! -f "$file" ]] && continue

        MATCHES=$(grep -nE "$REGEX" "$file" 2>/dev/null || true)
        if [[ -n "$MATCHES" ]]; then
            if [[ $FOUND -eq 0 ]]; then
                echo "=== Potential secrets/credentials detected ==="
                echo ""
            fi
            FOUND=1
            echo "[$DESC]"
            echo "$MATCHES" | while read -r line; do
                echo "  $file:$line"
            done
            echo ""
        fi
    done
done

if [[ $FOUND -ne 0 ]]; then
    echo "---"
    echo "If these are intentional (e.g., examples with placeholders), add the file"
    echo "to EXCLUDE_PATTERNS in scripts/check-no-secrets.sh"
    exit 1
fi
