# Todo

`extensions/todo/` gives the agent a private durable task list.

## Provides

- Agent-facing `todo` tool
- Active-todo injection into the system prompt
- TUI widget for pending, in-progress, and recently completed tasks
- Session-scoped persistent markdown stores under `~/.pi/agent/todos/`

## Purpose

The agent uses todo items to track multi-step work, open user requests, and follow-up tasks for the current session. Todos are scoped by pi session file so unrelated sessions do not mix their task lists. Todo text is normalized to one line before persistence so user/tool text cannot inject extra Markdown todo rows.

## Widget behavior

The TUI widget shows a rolling window of up to 5 entries. It prioritizes the oldest unfinished todos first. Completed items remain visible until the window needs space, but the widget is hidden when no unfinished todos remain.
