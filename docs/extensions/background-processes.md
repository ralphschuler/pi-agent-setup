# Background processes guidance

`extensions/background-processes/` injects guidance into the agent prompt about using the custom `process` tool for long-running commands.

## Purpose

It reminds the agent to use managed background processes for:

- Dev servers
- Test watchers
- Build watchers
- Local APIs
- Preview servers
- Log tails

## Why it exists

Long-running commands should not block the agent turn or be started with shell background patterns such as `&`, `nohup`, `disown`, or `setsid`. The `process` tool keeps those commands inspectable and controllable.

## Related pages

- [Processes](processes.md)
- [Validation and testing](../validation-testing.md)
