#!/usr/bin/env bash
# Build block software Docker image and push to the shared block-dev ECR on AWS.
#
# Usage:
#   ./scripts/deploy-block-aws.sh <software-dir> [--tag <tag>] [--ecr <repo-url>] [--region <region>]
#
# Examples:
#   ./scripts/deploy-block-aws.sh ../../blocks/gpu-test/software/gpu-info
#   ./scripts/deploy-block-aws.sh /abs/path/to/software/my-sw --tag my-feature
#   ./scripts/deploy-block-aws.sh ../../blocks/gpu-test/software/gpu-info \
#       --ecr <account>.dkr.ecr.<region>.amazonaws.com/<repo>
#
# What it does:
#   1. pnpm run build in the software dir (pl-pkg generates Dockerfile + context)
#   2. Builds linux/amd64 Docker image
#   3. Logs in to ECR and pushes the image
#   4. Writes dist/artifacts/<entrypoint>/docker_{x64,aarch64}.json so the block's
#      .sw.json descriptor references the remote image
#   5. Re-runs the block-level build so .sw.json picks the new artifact descriptor
#
# After running, deploy the dev block (e.g. via ./scripts/deploy-block-remote.sh
# for bare-metal hosts, or by adding the dev block path in the Desktop App when
# pointing at the K8s cluster — see docs/dev-block-remote-testing.md).
#
# Environment:
#   AWS_PROFILE       - AWS profile that has push access to the target ECR
#                       (the account hosting the ECR is auto-detected from STS).
#   AWS_REGION        - AWS region of the ECR (default: eu-north-1).
#   ECR_REPO_NAME     - ECR repository name within the account
#                       (default: platforma-internal-production/milaboratories/pl-containers).
#
# Notes:
#   * No account IDs, profile names, or other org-specific secrets are hardcoded
#     in this script. The defaults match the canonical block-dev ECR; override
#     with --ecr/--region or env vars for any other registry.

set -euo pipefail

SOFTWARE_DIR=""
TAG=""
ECR_REPO=""  # auto-composed from <account>.dkr.ecr.<region>.amazonaws.com/$ECR_REPO_NAME
REGION="${AWS_REGION:-eu-north-1}"
ECR_REPO_NAME="${ECR_REPO_NAME:-platforma-internal-production/milaboratories/pl-containers}"

usage() {
    echo "Usage: $0 <software-dir> [--tag <tag>] [--ecr <repo-url>] [--region <region>]"
    echo ""
    echo "Builds a block-software Docker image and pushes it to the AWS block-dev ECR."
    echo ""
    echo "Options:"
    echo "  --tag <tag>       Image tag (default: auto-generated from content hash)"
    echo "  --ecr <repo-url>  Full ECR URL <account>.dkr.ecr.<region>.amazonaws.com/<name>"
    echo "                    (default: auto-detected account + \$ECR_REPO_NAME)"
    echo "  --region <region> AWS region for ECR auth (default: \$AWS_REGION or eu-north-1)"
    echo ""
    echo "Env:"
    echo "  AWS_PROFILE       Profile with push access to the target ECR."
    echo "  ECR_REPO_NAME     Repository name within the account."
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

# Auto-detect ECR repo URL from AWS account if not explicitly set.
if [[ -z "$ECR_REPO" ]]; then
    PROFILE_FLAG=""
    [[ -n "${AWS_PROFILE:-}" ]] && PROFILE_FLAG="--profile $AWS_PROFILE"
    ACCOUNT_ID=$(aws sts get-caller-identity $PROFILE_FLAG --query Account --output text 2>/dev/null) \
        || { echo "Error: could not detect AWS account ID. Set --ecr explicitly or configure AWS credentials."; exit 1; }
    ECR_REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO_NAME"
fi

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

cat > "$ARTIFACT_DIR/docker_x64.json" <<EOF
{"type":"docker","platform":"linux-x64","remoteArtifactLocation":"$IMAGE","entrypoint":[]}
EOF

cat > "$ARTIFACT_DIR/docker_aarch64.json" <<EOF
{"type":"docker","platform":"linux-aarch64","remoteArtifactLocation":"$IMAGE","entrypoint":[]}
EOF

echo "=== Rebuilding block to pick up new image ==="
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
echo "  1. Rsync block to remote (bare-metal): ./scripts/deploy-block-remote.sh $BLOCK_ROOT <remote-host>"
echo "  2. Or add the dev block at $BLOCK_ROOT in Desktop App and run it against your K8s Platforma."
