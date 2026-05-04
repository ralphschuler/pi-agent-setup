---
name: pi-subagents
description: Delegate bounded work to this package's custom subagent tool. Use for specialist reconnaissance, planning, research, implementation handoffs, and independent review when parallel context or separation of concerns helps.
---

# Pi Subagents

Use the custom `subagent` tool for bounded delegation while keeping the parent agent responsible for synthesis and final user-facing decisions.

## Workflow

1. Call `subagent` with `action: "list"` before non-trivial delegation.
2. Pick an existing built-in or custom agent whose description matches the task.
3. Give a concrete, scoped task with expected output.
4. For independent work, pass `tasks` plus optional `concurrency` to run agents in parallel.
5. Use the result as input; verify important claims directly before finalizing.

## Built-in agents

- `scout` — read-only codebase reconnaissance.
- `planner` — plans and risk breakdowns.
- `reviewer` — independent review.
- `worker` — bounded implementation handoff.
- `researcher` — general technical research and synthesis.

## Management

- `action: "create"` with JSON `config` creates a custom markdown agent.
- `action: "delete"` with `agent` removes a custom agent.
- Omit `action` or use `action: "run"` with `agent` and `task` to run a subagent.
- Use `action: "parallel"` or provide `tasks: [{ agent, task, output?, cwd?, count? }]` for parallel runs. `concurrency` defaults to 4. Use `{index}` in output paths for repeated or parallel artifacts.

Avoid delegation for simple tasks that can be handled directly.
