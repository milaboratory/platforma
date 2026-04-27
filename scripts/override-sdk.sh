#!/usr/bin/env bash
# Apply a local SDK override to a block's pnpm workspace.
#
# Usage:
#   ./scripts/override-sdk.sh <block-dir> [--sdk <sdk-package-name>]
#
# Examples:
#   ./scripts/override-sdk.sh /path/to/blocks/gpu-test
#   ./scripts/override-sdk.sh blocks/gpu-test --sdk @platforma-sdk/workflow-tengo
#
# What it does:
#   1. Builds and packs the SDK from the monorepo
#   2. Activates the pnpm override in the block's package.json
#   3. Runs pnpm install --force to apply the override
#   4. Rebuilds the block
#
# To revert: change "pnpm" back to "//pnpm" in the block's package.json and run pnpm install

set -euo pipefail

BLOCK_DIR=""
SDK_PACKAGE="@platforma-sdk/workflow-tengo"

usage() {
    echo "Usage: $0 <block-dir> [--sdk <package-name>]"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --sdk) SDK_PACKAGE="$2"; shift 2 ;;
        --help|-h) usage ;;
        -*) echo "Unknown option: $1"; usage ;;
        *) BLOCK_DIR="$1"; shift ;;
    esac
done

[[ -z "$BLOCK_DIR" ]] && { echo "Error: block directory required"; usage; }

BLOCK_DIR=$(cd "$BLOCK_DIR" && pwd)

# Find the monorepo root (this script lives in core/platforma/scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Map SDK package name to directory
case "$SDK_PACKAGE" in
    "@platforma-sdk/workflow-tengo")
        SDK_DIR="$MONOREPO_ROOT/sdk/workflow-tengo"
        ;;
    *)
        echo "Error: unknown SDK package '$SDK_PACKAGE'"
        echo "Supported: @platforma-sdk/workflow-tengo"
        exit 1
        ;;
esac

echo "=== Building SDK: $SDK_PACKAGE ==="
cd "$SDK_DIR"
pnpm run build
TGZ=$(pnpm pack 2>&1 | tail -1)
TGZ_PATH="$SDK_DIR/$TGZ"

if [[ ! -f "$TGZ_PATH" ]]; then
    echo "Error: pack did not produce expected file: $TGZ_PATH"
    exit 1
fi

echo "=== Packed: $TGZ_PATH ==="

echo "=== Applying override in $BLOCK_DIR ==="
cd "$BLOCK_DIR"

# Activate the override: replace "//pnpm" with "pnpm" and set the path
python3 -c "
import json, sys

with open('package.json') as f:
    pkg = json.load(f)

# Remove commented-out overrides
pkg.pop('//pnpm', None)

# Set active override
pkg['pnpm'] = {
    'overrides': {
        '$SDK_PACKAGE': 'file:$TGZ_PATH'
    }
}

with open('package.json', 'w') as f:
    json.dump(pkg, f, indent=2)
    f.write('\n')

print('Override set in package.json')
"

echo "=== Installing with override ==="
pnpm install --force

echo "=== Building block ==="
pnpm run build --force

echo ""
echo "=== SDK override applied ==="
echo "To revert: edit package.json, change 'pnpm' back to '//pnpm', then run 'pnpm install'"
