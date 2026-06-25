#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${1:-/opt/affine}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PREDEPLOY_SRC="$REPO_ROOT/packages/backend/server/scripts/self-host-predeploy.js"
COMPOSE_SRC="$REPO_ROOT/.docker/pimpochka/compose.yml"

if [[ ! -f "$PREDEPLOY_SRC" ]]; then
  echo "Error: missing $PREDEPLOY_SRC"
  exit 1
fi

mkdir -p "$INSTALL_DIR/scripts"
cp "$PREDEPLOY_SRC" "$INSTALL_DIR/scripts/self-host-predeploy.js"
cp "$COMPOSE_SRC" "$INSTALL_DIR/docker-compose.yml"

if [[ -f "$INSTALL_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$INSTALL_DIR/.env"
  set +a
fi

cd "$INSTALL_DIR"

echo "=== Run migration ==="
docker compose run --rm affine_migration

echo "=== Restart stack ==="
docker compose up -d
docker compose ps

echo "Done. predeploy: $INSTALL_DIR/scripts/self-host-predeploy.js"
