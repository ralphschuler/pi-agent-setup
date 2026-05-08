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
  PI_SCOPE=global|local   Alternative way to select scope.
  PI_ALIAS_DIR=path       Directory for runnable aliases (default: ~/.local/bin).
  PI_SETUP_SHELL_RC=path  Shell startup file to update (default: detected rc file).
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
BLOCK_START="# >>> pi-agent-setup aliases >>>"
BLOCK_END="# <<< pi-agent-setup aliases <<<"

select_shell_rc() {
  if [[ -n "${PI_SETUP_SHELL_RC:-}" ]]; then
    printf '%s\n' "$PI_SETUP_SHELL_RC"
    return
  fi

  case "${SHELL:-}" in
    */zsh) printf '%s\n' "$HOME/.zshrc" ;;
    */bash) printf '%s\n' "$HOME/.bashrc" ;;
    *)
      if [[ -f "$HOME/.zshrc" ]]; then
        printf '%s\n' "$HOME/.zshrc"
      elif [[ -f "$HOME/.bashrc" ]]; then
        printf '%s\n' "$HOME/.bashrc"
      else
        printf '%s\n' "$HOME/.profile"
      fi
      ;;
  esac
}

remove_managed_alias_block() {
  local rc_file="$1"
  [[ -f "$rc_file" ]] || return 0
  perl -0pi -e 's/\n?# >>> pi-agent-setup aliases >>>\n.*?\n# <<< pi-agent-setup aliases <<<\n?//gs' "$rc_file"
}

remove_alias_path() {
  local rc_file
  rc_file="$(select_shell_rc)"
  remove_managed_alias_block "$rc_file"
  echo "Removed pi-agent-setup PATH block from $rc_file if present."
}

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
remove_alias_path

echo "Done. Restart pi or run /reload in an existing session."
