---
name: pi-processes
description: Manage long-running commands with this package's custom process tool. Use for dev servers, test watchers, build watchers, local APIs, preview servers, and log tails that should keep running while work continues.
---

# Pi Processes

Use the custom `process` tool instead of shell background patterns such as `&`, `nohup`, `disown`, or `setsid`.

## Workflow

1. Start a command with a stable descriptive name.
2. Continue other work; do not block the conversation waiting for watchers or servers.
3. Inspect `process output` or `process logs` only when needed.
4. Use `process write` for stdin.
5. Kill processes when they are no longer needed and clear finished entries.

## Common actions

- `start`: requires `name` and `command`.
- `list`: shows known processes.
- `output`: requires `id`; returns recent stdout/stderr.
- `logs`: requires `id`; returns log file paths.
- `kill`: requires `id`.
- `clear`: removes finished processes from the manager.
- `write`: requires `id` and `input`; optional `end` closes stdin.
