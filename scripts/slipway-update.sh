#!/usr/bin/env bash
# Re-run install / update Slipway in place.
set -euo pipefail
DIR="${SLIPWAY_DIR:-$HOME/slipway}"
exec bash -c "curl -fsSL https://raw.githubusercontent.com/fampep/slipway/main/install.sh | SLIPWAY_DIR='$DIR' bash"
