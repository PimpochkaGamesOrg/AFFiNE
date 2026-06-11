#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKERFILE="$REPO_ROOT/.docker/pimpochka/Dockerfile.vps"
IMAGE_NAME="${AFFINE_IMAGE:-pimpochka/affine:latest}"

warn_low_swap() {
  if [[ ! -r /proc/meminfo ]]; then
    return
  fi
  local swap_kb
  swap_kb="$(awk '/SwapTotal:/ {print $2}' /proc/meminfo)"
  if [[ "${swap_kb:-0}" -lt 4194304 ]]; then
    echo "Warning: swap is under 4GB. First build often needs 8GB swap on a small VPS:"
    echo "  sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile"
    echo "  sudo mkswap /swapfile && sudo swapon /swapfile"
    echo
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker is required."
    exit 1
  fi
}

warn_low_swap
require_docker

cd "$REPO_ROOT"

export DOCKER_BUILDKIT=1

echo "Building image: $IMAGE_NAME"
echo "Repo: $REPO_ROOT"
echo "First run can take 1-3 hours. Rebuilds are faster when Docker cache is warm."
echo

docker build \
  -f "$DOCKERFILE" \
  -t "$IMAGE_NAME" \
  --progress=plain \
  .

echo
echo "Image ready: $IMAGE_NAME"
docker image inspect "$IMAGE_NAME" --format 'Size: {{.Size}} bytes, created {{.Created}}'
