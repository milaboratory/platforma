#!/usr/bin/env bash
# Build block software Docker image and push to dev ECR registry.
#
# Usage:
#   ./scripts/deploy-block-software.sh <software-dir> [--tag <tag>] [--ecr <repo-url>] [--region <region>]
#
# Examples:
#   ./scripts/deploy-block-software.sh blocks/gpu-test/software/gpu-info
#   ./scripts/deploy-block-software.sh blocks/gpu-test/software/gpu-info --tag my-feature
#   ./scripts/deploy-block-software.sh /abs/path/to/software/my-sw --ecr 511903394050.dkr.ecr.eu-central-1.amazonaws.com/pl-block-software-dev
#
# What it does:
#   1. Runs pl-pkg build --docker-build to generate Dockerfile and build context
#   2. Builds linux/amd64 Docker image
#   3. Pushes to the dev ECR registry
#   4. Creates dist/artifacts/*/docker_x64.json so the block can reference the image
#   5. Rebuilds the block so the .sw.json descriptor picks up the new image
#
# After running, rsync or re-add the dev block to use the new image on K8s.
#
# Environment:
#   AWS_PROFILE   - AWS profile for ECR auth (optional)
#   AWS_REGION    - AWS region (default: eu-central-1)

set -euo pipefail

SOFTWARE_DIR=""
TAG=""
ECR_REPO="511903394050.dkr.ecr.eu-central-1.amazonaws.com/pl-block-software-dev"
REGION="${AWS_REGION:-eu-central-1}"

usage() {
    echo "Usage: $0 <software-dir> [--tag <tag>] [--ecr <repo-url>] [--region <region>]"
    echo ""
    echo "Builds block software Docker image and pushes to dev ECR."
    echo ""
    echo "Options:"
    echo "  --tag <tag>      Image tag (default: auto-generated from content hash)"
    echo "  --ecr <repo-url> ECR repository URL (default: pl-block-software-dev in eu-central-1)"
    echo "  --region <region> AWS region for ECR auth (default: eu-central-1)"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --tag) TAG="$2"; shift 2 ;;
        --ecr) ECR_REPO="$2"; shift 2 ;;
        --region) REGION="$2"; shift 2 ;;
        --help|-h) usage ;;
        -*) echo "Unknown option: $1"; usage ;;
        *) SOFTWARE_DIR="$1"; shift ;;
    esac
done

[[ -z "$SOFTWARE_DIR" ]] && { echo "Error: software directory required"; usage; }

SOFTWARE_DIR=$(cd "$SOFTWARE_DIR" && pwd)

[[ ! -f "$SOFTWARE_DIR/package.json" ]] && { echo "Error: $SOFTWARE_DIR/package.json not found"; exit 1; }

# Extract package name from package.json
PKG_NAME=$(python3 -c "import json; print(json.load(open('$SOFTWARE_DIR/package.json'))['name'])" 2>/dev/null || echo "unknown")

echo "=== Building block software: $PKG_NAME ==="
cd "$SOFTWARE_DIR"

# Build with pl-pkg to generate Dockerfile
pnpm run build

# Find the generated Dockerfile
DOCKERFILE=""
for f in dist/docker/Dockerfile-*; do
    [[ -f "$f" ]] && DOCKERFILE="$f" && break
done
[[ -z "$DOCKERFILE" ]] && { echo "Error: no Dockerfile found in dist/docker/"; exit 1; }

# Find entrypoint name from Dockerfile name (e.g., Dockerfile-main → main)
ENTRYPOINT=$(basename "$DOCKERFILE" | sed 's/Dockerfile-//')

# Determine source context
SRC_DIR="src"
[[ ! -d "$SRC_DIR" ]] && SRC_DIR="."

# Generate tag from content hash if not provided
if [[ -z "$TAG" ]]; then
    CONTENT_HASH=$(find "$SRC_DIR" -type f | sort | xargs shasum 2>/dev/null | shasum | cut -c1-12)
    # Format: <sanitized-pkg-name>.<entrypoint>.<hash>
    SAFE_NAME=$(echo "$PKG_NAME" | sed 's|@||; s|/|.|g')
    TAG="${SAFE_NAME}.${ENTRYPOINT}.${CONTENT_HASH}"
fi

IMAGE="$ECR_REPO:$TAG"

echo "=== Building Docker image ==="
echo "    Dockerfile: $DOCKERFILE"
echo "    Context:    $SRC_DIR"
echo "    Image:      $IMAGE"

docker build --platform linux/amd64 -t "$IMAGE" -f "$DOCKERFILE" "$SRC_DIR"

echo "=== Logging in to ECR ==="
ACCOUNT_ID=$(echo "$ECR_REPO" | cut -d. -f1)
PROFILE_FLAG=""
[[ -n "${AWS_PROFILE:-}" ]] && PROFILE_FLAG="--profile $AWS_PROFILE"
aws ecr get-login-password --region "$REGION" $PROFILE_FLAG | \
    docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

echo "=== Pushing to ECR ==="
docker push "$IMAGE"

echo "=== Creating docker artifact descriptor ==="
ARTIFACT_DIR="dist/artifacts/$ENTRYPOINT"
mkdir -p "$ARTIFACT_DIR"

# Create docker_x64.json so pl-pkg prepublish and .sw.json generation work
cat > "$ARTIFACT_DIR/docker_x64.json" <<EOF
{"type":"docker","platform":"linux-x64","remoteArtifactLocation":"$IMAGE","entrypoint":[]}
EOF

# Also create aarch64 pointing to same image (no native ARM build for dev)
cat > "$ARTIFACT_DIR/docker_aarch64.json" <<EOF
{"type":"docker","platform":"linux-aarch64","remoteArtifactLocation":"$IMAGE","entrypoint":[]}
EOF

echo "=== Rebuilding block to pick up new image ==="
# Go to block root (parent of software dir, then parent of software/)
BLOCK_ROOT=$(cd "$SOFTWARE_DIR/../.." && pwd)
if [[ -f "$BLOCK_ROOT/turbo.json" ]]; then
    cd "$BLOCK_ROOT"
    pnpm run build --force
fi

echo ""
echo "=== Done ==="
echo ""
echo "Image: $IMAGE"
echo "Artifact: $ARTIFACT_DIR/docker_x64.json"
echo ""
echo "Next steps:"
echo "  1. Rsync block to remote: ./scripts/deploy-block-remote.sh $BLOCK_ROOT <remote-host>"
echo "  2. Or remove and re-add the dev block in Desktop App"
