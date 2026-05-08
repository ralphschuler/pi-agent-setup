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

preflight_aliases() {
  local alias_dir="${PI_ALIAS_DIR:-$HOME/.local/bin}"
  local name link

  for name in pi-acp pi-screen; do
    link="$alias_dir/$name"
    if [[ -e "$link" && ! -L "$link" ]]; then
      echo "Error: cannot link $link because it already exists and is not a symlink." >&2
      exit 1
    fi
  done
}

if [[ -f "$ROOT_DIR/package.json" ]] && command -v npm >/dev/null 2>&1; then
  echo "Installing package dependencies"
  npm --prefix "$ROOT_DIR" install --legacy-peer-deps
fi

preflight_aliases

echo "Validating package"
bash "$ROOT_DIR/scripts/check.sh"

if [[ "$SCOPE" == "local" ]]; then
  echo "Installing pi package locally: $ROOT_DIR"
  pi install -l "$ROOT_DIR"
else
  echo "Installing pi package globally: $ROOT_DIR"
  pi install "$ROOT_DIR"
fi

ALIAS_DIR="${PI_ALIAS_DIR:-$HOME/.local/bin}"
link_alias() {
  local name="$1"
  local target="$ROOT_DIR/bin/${name}.mjs"
  local link="$ALIAS_DIR/$name"

  ln -sfn "$target" "$link"
}

echo "Linking runnable aliases in $ALIAS_DIR"
mkdir -p "$ALIAS_DIR"
link_alias "pi-acp"
link_alias "pi-screen"

echo "Done. Restart pi or run /reload in an existing session. Ensure $ALIAS_DIR is in PATH for pi-acp and pi-screen."
