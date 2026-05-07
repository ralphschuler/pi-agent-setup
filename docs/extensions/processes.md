# Processes

`extensions/processes/` provides a managed background process system.

## Provides

- Agent-facing `process` tool
- `/ps` themed process dashboard
- Custom tool result rendering
- Compact live stdout/stderr tails while a started process emits output
- Completion alerts
- Log watches with unsafe-regex rejection

## Use for

- Dev servers
- Test watchers
- Build watchers
- Local APIs
- Preview servers
- Log tails

## Avoid

Do not use shell background patterns for long-running work:

```bash
command &
nohup command
disown
setsid command
```

Use the `process` tool instead so output, logs, and lifecycle remain visible.

## Waiting for finite tasks

For finite commands that may take a short time to finish, start them with `process`, call `wait` once for a reasonable duration, then inspect `process output` or `process list` once. Avoid repeated process polling loops.

## Output limits

Live process updates are throttled and show only the last few stdout/stderr lines. Full in-memory output remains available through `process output`; log file paths remain available through `process logs`.
