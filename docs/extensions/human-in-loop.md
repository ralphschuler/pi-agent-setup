# Human in loop

`extensions/human-in-loop/` lets the agent ask concise clarification or approval questions through TUI controls.

## Provides

- Agent-facing `human_in_loop` tool
- Select, confirm, input, and editor modes
- Bounded interactive prompt text so long approval context does not flood the terminal

## Use cases

- Requirements are ambiguous
- A decision changes user intent
- Approval is needed before a risky action
- Proceeding would require guessing
