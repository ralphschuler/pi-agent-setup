# Processes

`extensions/processes/` provides a managed background process system.

## Provides

- Agent-facing `process` tool
- `/ps` themed process dashboard
- Custom tool result rendering
- Detached stdout/stderr capture after start
- Completion alerts
- Log watches with unsafe-regex rejection
- Private bounded logs with atomic truncation and secret-redacted agent-visible output

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

Process output after `start` is captured in memory and bounded log files, but it is not streamed through stale tool updates after the tool call returns. Use `process output` for the in-memory tail; use `process logs` for log file paths.
