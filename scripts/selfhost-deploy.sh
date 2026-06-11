#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${1:-/opt/affine}"

"$SCRIPT_DIR/selfhost-build.sh"
"$SCRIPT_DIR/selfhost-install.sh" "$INSTALL_DIR"
