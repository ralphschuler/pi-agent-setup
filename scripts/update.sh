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
  PI_SETUP_PULL=0      Same as --no-pull
  PI_SETUP_CHECK=0     Same as --no-check
  PI_ALIAS_DIR=path    Directory for runnable aliases (default: ~/.local/bin).
  PI_SETUP_SHELL_RC=path  Shell startup file to update (default: detected rc file).
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

ALIAS_DIR="${PI_ALIAS_DIR:-$HOME/.local/bin}"
BLOCK_START="# >>> pi-agent-setup aliases >>>"
BLOCK_END="# <<< pi-agent-setup aliases <<<"

alias_target() {
  local name="$1"
  printf '%s\n' "$ROOT_DIR/bin/${name}.mjs"
}

preflight_aliases() {
  local name link target current_target

  for name in pi-acp pi-screen; do
    link="$ALIAS_DIR/$name"
    target="$(alias_target "$name")"
    if [[ -L "$link" ]]; then
      current_target="$(readlink "$link")"
      if [[ "$current_target" != "$target" ]]; then
        echo "Error: cannot link $link because it already points to $current_target." >&2
        exit 1
      fi
    elif [[ -e "$link" ]]; then
      echo "Error: cannot link $link because it already exists and is not a symlink." >&2
      exit 1
    fi
  done
}

shell_quote() {
  printf "'%s'" "${1//\'/\'\\\'\'}"
}

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

install_alias_path() {
  local rc_file alias_dir_quoted
  rc_file="$(select_shell_rc)"
  alias_dir_quoted="$(shell_quote "$ALIAS_DIR")"

  mkdir -p "$(dirname "$rc_file")"
  touch "$rc_file"
  remove_managed_alias_block "$rc_file"
  cat >>"$rc_file" <<EOF

$BLOCK_START
pi_agent_setup_alias_dir=$alias_dir_quoted
case ":\$PATH:" in
  *":\${pi_agent_setup_alias_dir}:"*) ;;
  *) export PATH="\${pi_agent_setup_alias_dir}:\$PATH" ;;
esac
$BLOCK_END
EOF
  echo "Added $ALIAS_DIR to PATH in $rc_file. Open a new shell or source that file to use pi-acp and pi-screen."
}

preflight_aliases

if [[ -f "$ROOT_DIR/package.json" ]] && command -v npm >/dev/null 2>&1; then
  echo "Updating package dependencies"
  npm --prefix "$ROOT_DIR" install --legacy-peer-deps
fi

if [[ "$RUN_CHECK" == "1" ]]; then
  bash "$ROOT_DIR/scripts/check.sh"
fi

link_alias() {
  local name="$1"
  local target link
  target="$(alias_target "$name")"
  link="$ALIAS_DIR/$name"

  if [[ ! -e "$link" && ! -L "$link" ]]; then
    ln -s "$target" "$link"
  fi
}

echo "Linking runnable aliases in $ALIAS_DIR"
mkdir -p "$ALIAS_DIR"
link_alias "pi-acp"
link_alias "pi-screen"
install_alias_path

if command -v pi >/dev/null 2>&1; then
  echo "Refreshing pi package entry for $ROOT_DIR"
  pi update "$ROOT_DIR" || true
else
  echo "pi CLI not found; skipped pi update."
fi

echo "Done. Restart pi or run /reload in an existing session. Ensure $ALIAS_DIR is in PATH for pi-acp and pi-screen."
