#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCOPE="${PI_SCOPE:-global}"

usage() {
  cat <<'USAGE'
Usage: scripts/install.sh [--global|--local]

Installs this repository as a pi package.

Options:
  --global   Install into ~/.pi/agent/settings.json (default)
  --local    Install into .pi/settings.json for the current project

Environment:
  PI_SCOPE=global|local  Alternative way to select scope.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --global) SCOPE="global" ;;
    --local|-l) SCOPE="local" ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

if ! command -v pi >/dev/null 2>&1; then
  echo "Error: pi CLI not found in PATH." >&2
  exit 1
fi

if [[ "$SCOPE" == "local" ]]; then
  echo "Installing pi package locally: $ROOT_DIR"
  pi install -l "$ROOT_DIR"
else
  echo "Installing pi package globally: $ROOT_DIR"
  pi install "$ROOT_DIR"
fi

echo "Done. Restart pi or run /reload in an existing session."
