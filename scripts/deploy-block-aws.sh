#!/usr/bin/env bash
# Build block software Docker image(s) and push to the shared block-dev ECR on AWS.
#
# Usage:
#   ./scripts/deploy-block-aws.sh <path> [--tag <tag>] [--ecr <repo-url>] [--region <region>]
#
# <path> can be any of:
#   * a block root directory (with model/, workflow/, software/, …)
#       e.g. ../../blocks/clonotype-enrichment
#   * a block's software/ directory (FLAT layout: software/package.json)
#   * a single software package directory (NESTED layout: software/<name>/package.json)
#
# Examples:
#   ./scripts/deploy-block-aws.sh ../../blocks/clonotype-enrichment
#   ./scripts/deploy-block-aws.sh ../../blocks/gpu-test
#   ./scripts/deploy-block-aws.sh ../../blocks/gpu-test/software/gpu-info
#   ./scripts/deploy-block-aws.sh /abs/path/to/software/my-sw --tag my-feature
#   ./scripts/deploy-block-aws.sh ../../blocks/clonotype-enrichment \
#       --ecr <account>.dkr.ecr.<region>.amazonaws.com/<repo>
#
# What it does:
#   1. Discovers software package(s) under <path>.
#   2. For each package:
#      a. pnpm run build (pl-pkg generates one Dockerfile per entrypoint).
#      b. For every dist/docker/Dockerfile-<entrypoint>:
#         - builds linux/amd64 image,
#         - logs in to ECR (once),
#         - pushes,
#         - writes dist/artifacts/<entrypoint>/docker_{x64,aarch64}.json.
#   3. Re-runs the block-level pnpm build so .sw.json descriptors pick up the
#      new artifact descriptors.
#
# After running, deploy the dev block (e.g. via ./scripts/deploy-block-remote.sh
# for bare-metal hosts, or by adding the dev block path in the Desktop App when
# pointing at the K8s cluster — see docs/dev-block-remote-testing.md).
#
# Default registry:
#   public.ecr.aws/u5p1x5q2/pl-containers   (public ECR — anonymous pulls,
#                                            authenticated pushes via your
#                                            normal AWS credentials).
#
# Environment:
#   AWS_PROFILE       - AWS profile that has push access to the target ECR.
#   AWS_REGION        - AWS region for auth against a *private* ECR override
#                       (default: eu-north-1). Ignored for public ECR pushes —
#                       public ECR auth always uses us-east-1.
#   ECR_REPO          - Full ECR repository URL to push to. Overrides the
#                       default public.ecr.aws/u5p1x5q2/pl-containers.
#
# Notes:
#   * No account IDs, profile names, or other org-specific secrets are hardcoded
#     in this script. Override with --ecr/--region or env vars for any other
#     registry.

set -euo pipefail

INPUT_PATH=""
TAG=""
DEFAULT_ECR_REPO="public.ecr.aws/u5p1x5q2/pl-containers"
ECR_REPO="${ECR_REPO:-$DEFAULT_ECR_REPO}"
REGION="${AWS_REGION:-eu-north-1}"

usage() {
    cat <<EOF
Usage: $0 <path> [--tag <tag>] [--ecr <repo-url>] [--region <region>]

<path> may be a block root, a block's software/ directory, or a single
software package directory.

Options:
  --tag <tag>       Image tag (default: auto-generated per entrypoint from content hash).
                    Only meaningful when a single entrypoint is being pushed.
  --ecr <repo-url>  Full ECR repository URL. Default:
                      $DEFAULT_ECR_REPO
                    Use public.ecr.aws/<alias>/<repo> for public ECR (pulls
                    are anonymous), or <account>.dkr.ecr.<region>.amazonaws.com/<repo>
                    for a private ECR.
  --region <region> AWS region for *private* ECR auth (default: \$AWS_REGION
                    or eu-north-1). Ignored for public ECR — public auth uses
                    us-east-1 by AWS convention.

Env:
  AWS_PROFILE       Profile with push access to the target ECR.
  ECR_REPO          Full ECR URL override (same as --ecr).
EOF
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --tag) TAG="$2"; shift 2 ;;
        --ecr) ECR_REPO="$2"; shift 2 ;;
        --region) REGION="$2"; shift 2 ;;
        --help|-h) usage ;;
        -*) echo "Unknown option: $1"; usage ;;
        *) INPUT_PATH="$1"; shift ;;
    esac
done

[[ -z "$INPUT_PATH" ]] && { echo "Error: path required"; usage; }
[[ ! -d "$INPUT_PATH" ]] && { echo "Error: $INPUT_PATH is not a directory"; exit 1; }

INPUT_PATH=$(cd "$INPUT_PATH" && pwd)

# ---------------------------------------------------------------------------
# Discover software package directories under $INPUT_PATH.
# A "software package" is a directory with package.json that declares the
# "block-software" field (pl-pkg config).
# ---------------------------------------------------------------------------
is_software_pkg() {
    local d="$1"
    [[ -f "$d/package.json" ]] || return 1
    python3 -c "import json,sys; sys.exit(0 if 'block-software' in json.load(open('$d/package.json')) else 1)" 2>/dev/null
}

SOFTWARE_DIRS=()

if is_software_pkg "$INPUT_PATH"; then
    SOFTWARE_DIRS=("$INPUT_PATH")
elif [[ -d "$INPUT_PATH/software" ]] && is_software_pkg "$INPUT_PATH/software"; then
    # Block root, FLAT layout: <block>/software/package.json
    SOFTWARE_DIRS=("$INPUT_PATH/software")
elif [[ -d "$INPUT_PATH/software" ]]; then
    # Block root, NESTED layout: <block>/software/<name>/package.json
    for sub in "$INPUT_PATH/software"/*/; do
        [[ -d "$sub" ]] || continue
        sub="${sub%/}"
        if is_software_pkg "$sub"; then
            SOFTWARE_DIRS+=("$sub")
        fi
    done
elif [[ "$(basename "$INPUT_PATH")" == "software" ]]; then
    # Pointed at <block>/software/ that is NESTED-only (no package.json directly).
    for sub in "$INPUT_PATH"/*/; do
        [[ -d "$sub" ]] || continue
        sub="${sub%/}"
        if is_software_pkg "$sub"; then
            SOFTWARE_DIRS+=("$sub")
        fi
    done
fi

if [[ ${#SOFTWARE_DIRS[@]} -eq 0 ]]; then
    echo "Error: no block-software package(s) found under $INPUT_PATH"
    echo "       expected one of:"
    echo "         <block>/software/package.json"
    echo "         <block>/software/<name>/package.json"
    echo "         <software-pkg>/package.json with a 'block-software' field"
    exit 1
fi

# ---------------------------------------------------------------------------
# Resolve BLOCK_ROOT (used for the final block-level pnpm build).
# Walk up from the first software dir until we find turbo.json / package.json
# at the block root. Heuristic: stop at the parent containing turbo.json.
# ---------------------------------------------------------------------------
BLOCK_ROOT=""
candidate="${SOFTWARE_DIRS[0]}"
while [[ "$candidate" != "/" && -n "$candidate" ]]; do
    candidate=$(dirname "$candidate")
    if [[ -f "$candidate/turbo.json" ]]; then
        BLOCK_ROOT="$candidate"
        break
    fi
done
[[ -z "$BLOCK_ROOT" ]] && BLOCK_ROOT=$(dirname "${SOFTWARE_DIRS[0]}")

# ---------------------------------------------------------------------------
# Classify the registry (public vs private) and figure out the login endpoint.
# ---------------------------------------------------------------------------
PROFILE_FLAG=""
[[ -n "${AWS_PROFILE:-}" ]] && PROFILE_FLAG="--profile $AWS_PROFILE"

if [[ "$ECR_REPO" == public.ecr.aws/* ]]; then
    IS_PUBLIC=1
    LOGIN_REGISTRY="public.ecr.aws"
    # Public ECR auth is always us-east-1 by AWS convention.
    AUTH_REGION="us-east-1"
    AUTH_CMD="ecr-public"
else
    IS_PUBLIC=0
    # Private ECR URL is <account>.dkr.ecr.<region>.amazonaws.com/<name>.
    LOGIN_REGISTRY=$(echo "$ECR_REPO" | cut -d/ -f1)
    AUTH_REGION="$REGION"
    AUTH_CMD="ecr"
fi

echo "=== Plan ==="
echo "    Block root:   $BLOCK_ROOT"
echo "    ECR:          $ECR_REPO"
if [[ $IS_PUBLIC -eq 1 ]]; then
    echo "    Mode:         public (anonymous pulls, authenticated push)"
else
    echo "    Mode:         private (region $AUTH_REGION)"
fi
echo "    Packages:"
for d in "${SOFTWARE_DIRS[@]}"; do
    echo "      - $d"
done

# Sanity check: --tag is only meaningful for a single entrypoint push.
if [[ -n "$TAG" && ${#SOFTWARE_DIRS[@]} -gt 1 ]]; then
    echo ""
    echo "Warning: --tag was set but multiple software packages were discovered;"
    echo "         the same tag will be reused for each entrypoint. Press Ctrl-C"
    echo "         within 3s to abort and re-run with a single explicit software dir."
    sleep 3
fi

# ---------------------------------------------------------------------------
# ECR login (once).
# ---------------------------------------------------------------------------
echo "=== Logging in to $LOGIN_REGISTRY ==="
if ! aws "$AUTH_CMD" get-login-password --region "$AUTH_REGION" $PROFILE_FLAG \
        | docker login --username AWS --password-stdin "$LOGIN_REGISTRY"; then
    echo ""
    echo "Error: ECR login failed (see above)."
    echo "       Make sure AWS_PROFILE points to credentials with push access"
    echo "       to $ECR_REPO. For SSO sessions, refresh with"
    echo "       'aws sso login --profile <profile>' (or your equivalent) and retry."
    exit 1
fi

# ---------------------------------------------------------------------------
# Per-package processing.
# ---------------------------------------------------------------------------
PUSHED_IMAGES=()

for SOFTWARE_DIR in "${SOFTWARE_DIRS[@]}"; do
    PKG_NAME=$(python3 -c "import json; print(json.load(open('$SOFTWARE_DIR/package.json'))['name'])" 2>/dev/null || echo "unknown")
    echo ""
    echo "############################################################"
    echo "## Building software package: $PKG_NAME"
    echo "##   $SOFTWARE_DIR"
    echo "############################################################"

    ( cd "$SOFTWARE_DIR" && pnpm run build )

    if ! compgen -G "$SOFTWARE_DIR/dist/docker/Dockerfile-*" > /dev/null; then
        echo "Error: no Dockerfiles produced in $SOFTWARE_DIR/dist/docker/"
        exit 1
    fi

    # Source context for Docker build.
    SRC_DIR="$SOFTWARE_DIR/src"
    [[ ! -d "$SRC_DIR" ]] && SRC_DIR="$SOFTWARE_DIR"

    SAFE_NAME=$(echo "$PKG_NAME" | sed 's|@||; s|/|.|g')

    for DOCKERFILE in "$SOFTWARE_DIR"/dist/docker/Dockerfile-*; do
        ENTRYPOINT=$(basename "$DOCKERFILE" | sed 's/^Dockerfile-//')

        if [[ -n "$TAG" ]]; then
            ENTRY_TAG="$TAG"
        else
            CONTENT_HASH=$(find "$SRC_DIR" -type f | sort | xargs shasum 2>/dev/null | shasum | cut -c1-12)
            ENTRY_TAG="${SAFE_NAME}.${ENTRYPOINT}.${CONTENT_HASH}"
        fi

        IMAGE="$ECR_REPO:$ENTRY_TAG"

        echo ""
        echo "--- Entrypoint: $ENTRYPOINT ---"
        echo "    Dockerfile: $DOCKERFILE"
        echo "    Context:    $SRC_DIR"
        echo "    Image:      $IMAGE"

        docker build --platform linux/amd64 -t "$IMAGE" -f "$DOCKERFILE" "$SRC_DIR"
        docker push "$IMAGE"

        ARTIFACT_DIR="$SOFTWARE_DIR/dist/artifacts/$ENTRYPOINT"
        mkdir -p "$ARTIFACT_DIR"
        cat > "$ARTIFACT_DIR/docker_x64.json" <<EOF
{"type":"docker","platform":"linux-x64","remoteArtifactLocation":"$IMAGE","entrypoint":[]}
EOF
        cat > "$ARTIFACT_DIR/docker_aarch64.json" <<EOF
{"type":"docker","platform":"linux-aarch64","remoteArtifactLocation":"$IMAGE","entrypoint":[]}
EOF

        PUSHED_IMAGES+=("$IMAGE")
    done
done

# ---------------------------------------------------------------------------
# Block-level rebuild so .sw.json picks the new descriptors.
# ---------------------------------------------------------------------------
if [[ -f "$BLOCK_ROOT/turbo.json" ]]; then
    echo ""
    echo "=== Rebuilding block to pick up new images ==="
    ( cd "$BLOCK_ROOT" && pnpm run build --force )
fi

echo ""
echo "=== Done ==="
echo "Pushed images:"
for img in "${PUSHED_IMAGES[@]}"; do
    echo "  - $img"
done
echo ""
echo "Next steps:"
echo "  1. Rsync block to remote (bare-metal):"
echo "       ./scripts/deploy-block-remote.sh $BLOCK_ROOT <remote-host>"
echo "  2. Or add the dev block at $BLOCK_ROOT in Desktop App and run it against"
echo "     your K8s Platforma."
