#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCOPE="${PI_SCOPE:-global}"

usage() {
  cat <<'USAGE'
Usage: scripts/uninstall.sh [--global|--local]

Removes this repository from pi package settings.

Options:
  --global   Remove from ~/.pi/agent/settings.json (default)
  --local    Remove from .pi/settings.json for the current project

Environment:
  PI_SCOPE=global|local  Alternative way to select scope.
  PI_ALIAS_DIR=path       Directory for runnable aliases (default: ~/.local/bin).
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
  echo "Removing pi package locally: $ROOT_DIR"
  pi remove -l "$ROOT_DIR"
else
  echo "Removing pi package globally: $ROOT_DIR"
  pi remove "$ROOT_DIR"
fi

ALIAS_DIR="${PI_ALIAS_DIR:-$HOME/.local/bin}"
remove_alias() {
  local name="$1"
  local link="$ALIAS_DIR/$name"
  local target="$ROOT_DIR/bin/${name}.mjs"

  if [[ -L "$link" && "$(readlink "$link")" == "$target" ]]; then
    rm -f "$link"
  fi
}

remove_alias "pi-acp"
remove_alias "pi-screen"

echo "Done. Restart pi or run /reload in an existing session."
