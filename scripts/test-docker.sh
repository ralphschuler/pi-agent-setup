#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${IMAGE:-pi-agent-setup:test}"

cd "$ROOT_DIR"

docker build -t "$IMAGE" .

docker run --rm "$IMAGE" bash -lc '
  set -euo pipefail
  command -v pi >/dev/null
  pi --help >/dev/null
  test -f /root/.pi/agent/settings.json
  grep -q "/opt/pi-agent-setup" /root/.pi/agent/settings.json
'

echo "Docker image test passed: $IMAGE"
