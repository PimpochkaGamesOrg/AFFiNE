#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/affine"
SKIP_BUILD=false
CONFIRM=false

usage() {
  cat <<'EOF'
Usage: selfhost-fresh-install.sh [INSTALL_DIR] [OPTIONS]

Deletes all AFFiNE data and installs from scratch on this VPS.

Options:
  --yes, -y       Required. Confirm destructive wipe.
  --skip-build    Reuse existing local Docker image.

Examples:
  ./scripts/selfhost-fresh-install.sh --yes
  ./scripts/selfhost-fresh-install.sh /opt/affine --yes
  ./scripts/selfhost-fresh-install.sh --yes --skip-build
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes | -y)
      CONFIRM=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      if [[ "$1" == /* ]]; then
        INSTALL_DIR="$1"
      else
        echo "Unknown argument: $1"
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ "$CONFIRM" != true ]]; then
  echo "This removes all AFFiNE databases, uploads and config."
  echo "Re-run with --yes to continue."
  exit 1
fi

stop_compose_in() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  if [[ -f "$dir/docker-compose.yml" ]]; then
    echo "Stopping compose in $dir"
    (cd "$dir" && docker compose down -v --remove-orphans) || true
  fi
  if [[ -f "$dir/compose.yml" ]]; then
    echo "Stopping compose in $dir"
    (cd "$dir" && docker compose -f compose.yml down -v --remove-orphans) || true
  fi
}

echo "=== Stopping old AFFiNE containers ==="
stop_compose_in "$INSTALL_DIR"
stop_compose_in "$REPO_ROOT/.docker/selfhost"
stop_compose_in "/opt/affine-build/.docker/selfhost"
stop_compose_in "/opt/affine-build/affine-build/.docker/selfhost"

docker rm -f affine_server affine_migration_job affine_postgres affine_redis 2>/dev/null || true

echo "=== Removing old data ==="
rm -rf \
  "$INSTALL_DIR/data" \
  "$INSTALL_DIR/postgres" \
  "/root/.affine/self-host" \
  "/root/.affine/storage" \
  "/root/.affine/config"

mkdir -p \
  "$INSTALL_DIR/data/postgres" \
  "$INSTALL_DIR/data/storage" \
  "$INSTALL_DIR/data/config"

DB_PASSWORD="$(openssl rand -hex 16)"

cp "$REPO_ROOT/.docker/pimpochka/compose.yml" "$INSTALL_DIR/docker-compose.yml"
cp "$REPO_ROOT/.docker/pimpochka/.env.example" "$INSTALL_DIR/.env"
cp "$REPO_ROOT/.docker/pimpochka/config.json" "$INSTALL_DIR/data/config/config.json"

sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=${DB_PASSWORD}/" "$INSTALL_DIR/.env"

echo "=== New install directory: $INSTALL_DIR ==="
echo "DB password saved in $INSTALL_DIR/.env"

if [[ "$SKIP_BUILD" == true ]]; then
  "$SCRIPT_DIR/selfhost-install.sh" "$INSTALL_DIR"
else
  "$SCRIPT_DIR/selfhost-build.sh"
  "$SCRIPT_DIR/selfhost-install.sh" "$INSTALL_DIR"
fi

echo
echo "=== Fresh install complete ==="
echo "URL:      http://$(hostname -I | awk '{print $1}'):$(grep '^PORT=' "$INSTALL_DIR/.env" | cut -d= -f2)"
echo "Password: see DB_PASSWORD in $INSTALL_DIR/.env (Postgres only)"
echo "Data:     $INSTALL_DIR/data/"
