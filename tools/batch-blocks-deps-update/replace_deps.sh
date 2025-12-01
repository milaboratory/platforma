#!/bin/bash

usage() {
  cat <<'USAGE'
Usage: replace_deps.sh [--force|-f] <regex_pattern> <replacement>

Search and interactively replace matches across files under the current directory.

Options:
  --force, -f                Replace without interactive confirmation

Arguments:
  <regex_pattern>            Ripgrep-compatible regex to search for
  <replacement>              Replacement text

Examples:
  ./replace_deps.sh '\\bAPI_KEY\\b' 'ACCESS_TOKEN'
  ./replace_deps.sh --force '\\bAPI_KEY\\b' 'ACCESS_TOKEN'
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  usage
  exit 0
fi

# Check required tools
if ! command -v rg >/dev/null 2>&1; then
  echo "Error: 'rg' (ripgrep) is not installed. Please install ripgrep."
  exit 1
fi

# Parse options
FORCE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--force)
      FORCE=true
      shift
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

# Check for required arguments after parsing options
if [[ -z "$1" || -z "$2" ]]; then
  usage
  exit 1
fi

REGEX_PATTERN=$1
REPLACEMENT=$2

echo "🔍 Searching under current directory..."
echo "🔁 Replacing: '$REGEX_PATTERN' ➜ '$REPLACEMENT'"
if [[ "$FORCE" == "true" ]]; then
  echo "⚠️  Running in non-interactive mode due to --force"
fi

# Loop through matching files, excluding npm/pnpm lock files
for file in $(rg -l -e "$REGEX_PATTERN" --glob '!**/pnpm-lock.yaml' --glob '!**/package-lock.json' --glob '!**/npm-shrinkwrap.json' --glob '!**/yarn.lock' . 2>/dev/null); do
  echo -e "\n📄 Match found in: $file"
  rg --color always -C 3 -e "$REGEX_PATTERN" "$file"

  if [[ "$FORCE" == "true" ]]; then
    sd "$REGEX_PATTERN" "$REPLACEMENT" "$file"
    echo "✅ Replaced in $file (forced)"
  else
    read -rp "Do you want to replace in this file? (y/n): " confirm
    if [[ "$confirm" == "y" ]]; then
      sd "$REGEX_PATTERN" "$REPLACEMENT" "$file"
      echo "✅ Replaced in $file"
    else
      echo "⏭️ Skipped $file"
    fi
  fi
done

echo -e "\n🏁 Done."
