#!/usr/bin/env bash
# Build a block and deploy it to a remote bare-metal server via rsync.
#
# Usage:
#   ./scripts/deploy-block-remote.sh <block-dir> <remote-host>
#
# Examples:
#   ./scripts/deploy-block-remote.sh /path/to/blocks/gpu-test nova0.milaboratories.com
#   ./scripts/deploy-block-remote.sh blocks/gpu-test nova0.milaboratories.com
#
# What it does:
#   1. Builds the block (pnpm build --force)
#   2. Rsyncs the entire block directory (including node_modules) to the same path on the remote
#   3. Prints instructions for adding the dev block in the Desktop App
#
# Notes:
#   - Remote path matches local absolute path (required for dev blocks)
#   - node_modules is included because the remote server doesn't run pnpm install
#   - .git and .turbo are excluded to save bandwidth

set -euo pipefail

BLOCK_DIR=""
REMOTE_HOST=""

usage() {
    echo "Usage: $0 <block-dir> <remote-host>"
    echo ""
    echo "Examples:"
    echo "  $0 /path/to/blocks/gpu-test nova0.milaboratories.com"
    echo "  $0 blocks/gpu-test nova0.milaboratories.com"
    exit 1
}

[[ $# -lt 2 ]] && usage

BLOCK_DIR="$1"
REMOTE_HOST="$2"

# Resolve to absolute path
BLOCK_DIR=$(cd "$BLOCK_DIR" && pwd)

# Verify it's a block directory
if [[ ! -f "$BLOCK_DIR/package.json" ]]; then
    echo "Error: $BLOCK_DIR/package.json not found — not a valid block directory"
    exit 1
fi

# Find the block/ subdirectory (for dev block path)
BLOCK_PACK_DIR=""
if [[ -d "$BLOCK_DIR/block" ]]; then
    BLOCK_PACK_DIR="$BLOCK_DIR/block"
fi

echo "=== Building block ==="
cd "$BLOCK_DIR"
pnpm run build --force

echo ""
echo "=== Syncing to $REMOTE_HOST ==="
rsync -avz --delete \
    --exclude .turbo \
    --exclude .git \
    "$BLOCK_DIR/" "$REMOTE_HOST:$BLOCK_DIR/"

echo ""
echo "=== Done ==="
echo ""
if [[ -n "$BLOCK_PACK_DIR" ]]; then
    echo "Add as dev block in Desktop App pointing to:"
    echo "  $BLOCK_PACK_DIR"
else
    echo "Add as dev block in Desktop App pointing to:"
    echo "  $BLOCK_DIR"
fi
