# Todo

`extensions/todo/` gives the agent a private durable task list.

## Provides

- Agent-facing `todo` tool
- Active-todo injection into the system prompt
- TUI widget for pending and in-progress tasks
- Persistent markdown store at `~/.pi/agent/todo.md`

## Purpose

The agent uses todo items to track multi-step work, open user requests, and follow-up tasks that should survive future sessions.
