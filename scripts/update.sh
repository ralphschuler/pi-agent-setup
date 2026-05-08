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
  PI_ALIAS_DIR=path Directory for runnable aliases (default: ~/.local/bin).
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

preflight_aliases

if [[ -f "$ROOT_DIR/package.json" ]] && command -v npm >/dev/null 2>&1; then
  echo "Updating package dependencies"
  npm --prefix "$ROOT_DIR" install --legacy-peer-deps
fi

if [[ "$RUN_CHECK" == "1" ]]; then
  bash "$ROOT_DIR/scripts/check.sh"
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

if command -v pi >/dev/null 2>&1; then
  echo "Refreshing pi package entry for $ROOT_DIR"
  pi update "$ROOT_DIR" || true
else
  echo "pi CLI not found; skipped pi update."
fi

echo "Done. Restart pi or run /reload in an existing session. Ensure $ALIAS_DIR is in PATH for pi-acp and pi-screen."
