#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail=0

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "Missing required file: $1" >&2
    fail=1
  fi
}

require_dir() {
  if [[ ! -d "$1" ]]; then
    echo "Missing required directory: $1" >&2
    fail=1
  fi
}

require_file package.json
require_dir extensions
require_dir skills
require_dir prompts
require_dir themes

while IFS= read -r skill; do
  dir="$(basename "$(dirname "$skill")")"
  name="$(awk -F': *' '/^name:/ {print $2; exit}' "$skill" | tr -d '"'"'"'' )"
  desc="$(awk -F': *' '/^description:/ {print $2; exit}' "$skill" | tr -d '"'"'"'' )"
  if [[ -z "$name" ]]; then
    echo "Skill missing name: $skill" >&2
    fail=1
  elif [[ "$name" != "$dir" ]]; then
    echo "Skill name '$name' must match directory '$dir': $skill" >&2
    fail=1
  fi
  if [[ -z "$desc" ]]; then
    echo "Skill missing description: $skill" >&2
    fail=1
  fi
done < <(find skills -name SKILL.md -type f | sort)

if command -v node >/dev/null 2>&1; then
  node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
  while IFS= read -r json_file; do
    node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$json_file"
  done < <(find extensions themes -name '*.json' -type f | sort)
  while IFS= read -r source_file; do
    node --check "$source_file"
  done < <(find extensions tests -type f \( -name '*.ts' -o -name '*.js' -o -name '*.mjs' \) | sort)
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "Repository checks passed."
