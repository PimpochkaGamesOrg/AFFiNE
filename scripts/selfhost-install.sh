#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${1:-/opt/affine}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

mkdir -p \
  "$INSTALL_DIR/data/postgres" \
  "$INSTALL_DIR/data/storage" \
  "$INSTALL_DIR/data/config"

cp "$REPO_ROOT/.docker/pimpochka/compose.yml" "$INSTALL_DIR/docker-compose.yml"

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cp "$REPO_ROOT/.docker/pimpochka/.env.example" "$INSTALL_DIR/.env"
  echo "Created $INSTALL_DIR/.env - set DB_PASSWORD before production use."
fi

if [[ ! -f "$INSTALL_DIR/data/config/config.json" ]]; then
  cp "$REPO_ROOT/.docker/pimpochka/config.json" "$INSTALL_DIR/data/config/config.json"
fi

cd "$INSTALL_DIR"

set -a
# shellcheck disable=SC1091
source .env
set +a

IMAGE_NAME="${AFFINE_IMAGE:-pimpochka/affine:latest}"

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "Error: local image $IMAGE_NAME not found."
  echo "Build on this VPS first:"
  echo "  cd $REPO_ROOT && AFFINE_IMAGE=$IMAGE_NAME ./scripts/selfhost-build.sh"
  exit 1
fi

docker compose pull redis postgres 2>/dev/null || true
docker compose up -d

PORT_VALUE="${PORT:-3010}"
echo "AFFiNE: http://localhost:${PORT_VALUE}"
echo "Data: $INSTALL_DIR/data/"
echo "Image: $IMAGE_NAME"
