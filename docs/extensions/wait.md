# Wait

`extensions/wait/` provides an agent-facing `wait` tool for passive bounded delays.

## Provides

- `wait` tool
- Abort-aware delay
- 1–600 second bounds
- Default delay of 30 seconds

## Use for

Use `wait` when the agent has started a finite background task with `process` and wants to give it time to finish before checking once.

Example workflow:

1. Start the finite task with `process start`.
2. Call `wait` for a reasonable duration.
3. Call `process output` or `process list` once to inspect completion.

## Avoid

Do not use `wait` for:

- Future reminders or recurring work; use `cronjob` instead.
- Long-running watchers or dev servers that should keep running.
- Polling loops that repeatedly check process state.
- Shell-based sleeps such as `sleep 30` when an agent-facing delay is enough.

## Limits

`wait` accepts `seconds` from `1` to `600`. If omitted, it waits `30` seconds.
