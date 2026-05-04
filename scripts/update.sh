#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PULL="${PI_SETUP_PULL:-1}"
RUN_CHECK="${PI_SETUP_CHECK:-1}"

usage() {
  cat <<'USAGE'
Usage: scripts/update.sh [--no-pull] [--no-check]

Updates this local setup repository and refreshes pi package resources.

Options:
  --no-pull   Do not run git pull, only refresh/reinstall package entry
  --no-check  Skip repository validation

Environment:
  PI_SETUP_PULL=0   Same as --no-pull
  PI_SETUP_CHECK=0  Same as --no-check
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull) PULL=0 ;;
    --no-check) RUN_CHECK=0 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

if [[ "$PULL" == "1" && -d "$ROOT_DIR/.git" ]]; then
  echo "Pulling latest changes in $ROOT_DIR"
  git -C "$ROOT_DIR" pull --ff-only
fi

if [[ -f "$ROOT_DIR/package.json" ]] && command -v npm >/dev/null 2>&1; then
  echo "Updating package dependencies"
  npm --prefix "$ROOT_DIR" install
fi

if [[ "$RUN_CHECK" == "1" ]]; then
  bash "$ROOT_DIR/scripts/check.sh"
fi

if command -v pi >/dev/null 2>&1; then
  echo "Refreshing pi package entry for $ROOT_DIR"
  pi update "$ROOT_DIR" || true
else
  echo "pi CLI not found; skipped pi update."
fi

echo "Done. Restart pi or run /reload in an existing session."
