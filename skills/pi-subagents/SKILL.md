---
name: pi-subagents
description: Delegate bounded work to this package's custom subagent tool. Use for specialist reconnaissance, planning, research, implementation handoffs, and independent review when parallel context or separation of concerns helps.
---

# Pi Subagents

Use the custom `subagent` tool for bounded delegation while keeping the parent agent responsible for synthesis, verification, and final user-facing decisions.

If the user invoked a prompt or slash command with arguments, pass the relevant arguments into each subagent task so delegated work preserves the user's scope.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.

## Workflow

1. Call `subagent` with `action: "list"` before non-trivial delegation.
2. Pick an existing built-in or custom agent whose description matches the task.
3. If no matching specialist exists, create a narrow custom specialist with `subagent action=create` before running it.
4. Give each subagent a concrete, scoped task with expected output.
5. For independent work, pass `tasks` plus optional `concurrency` to run agents in parallel.
6. Use the result as input; verify important claims directly before finalizing.

## Built-in agents

- `scout` — read-only codebase reconnaissance.
- `planner` — plans and risk breakdowns split into independently and quickly testable feature phases.
- `reviewer` — independent review.
- `worker` — bounded implementation handoff.
- `researcher` — general technical research and synthesis.

## Management

- `action: "create"` with JSON `config` creates a custom markdown agent.
- Dynamic specialist configs must include a description, tool limits, success criteria, escalation rules, and output contract.
- `action: "delete"` with `agent` removes a custom agent.
- Omit `action` or use `action: "run"` with `agent` and `task` to run a subagent.
- Use `action: "parallel"` or provide `tasks: [{ agent, task, output?, cwd?, count? }]` for parallel runs. `concurrency` defaults to 4. Use `{index}` in output paths for repeated or parallel artifacts.

Avoid delegation for simple tasks that can be handled directly.
