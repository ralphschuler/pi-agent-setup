# Processes

`extensions/processes/` provides a managed background process system.

## Provides

- Agent-facing `process` tool
- `/ps` themed process dashboard
- Custom tool result rendering
- Completion alerts
- Log watches

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
