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
  PI_SCOPE=global|local   Alternative way to select scope.
  PI_ALIAS_DIR=path       Directory for executable command wrappers (default: ~/.local/bin).
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
    if [[ -e "$link" || -L "$link" ]]; then
      if grep -Fq "# pi-agent-setup managed wrapper: $name" "$link" 2>/dev/null; then
        continue
      fi
      if [[ -L "$link" ]]; then
        current_target="$(readlink "$link")"
        if [[ "$current_target" == "$target" ]]; then
          continue
        fi
        echo "Error: cannot install $link because it already points to $current_target." >&2
      else
        echo "Error: cannot install $link because it already exists and is not a managed wrapper." >&2
      fi
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

write_wrapper() {
  local name="$1"
  local target link
  target="$(alias_target "$name")"
  link="$ALIAS_DIR/$name"

  rm -f "$link"
  cat >"$link" <<EOF
#!/usr/bin/env bash
# pi-agent-setup managed wrapper: $name
exec node $(shell_quote "$target") "\$@"
EOF
  chmod 755 "$link"
}

echo "Writing executable command wrappers in $ALIAS_DIR"
mkdir -p "$ALIAS_DIR"
write_wrapper "pi-acp"
write_wrapper "pi-screen"
install_alias_path

echo "Done. Restart pi or run /reload in an existing session. Ensure $ALIAS_DIR is in PATH for pi-acp and pi-screen."
