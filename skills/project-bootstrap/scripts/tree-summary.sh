#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
find "$ROOT" \
  -path '*/.git' -prune -o \
  -path '*/node_modules' -prune -o \
  -path '*/.pi/npm' -prune -o \
  -maxdepth 3 -print | sort
