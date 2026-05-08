# Subagents

`extensions/subagents/` registers the custom `subagent` tool.

## Built-in agents

- `scout`
- `planner`
- `worker`
- `reviewer`
- `researcher`

## Capabilities

- List available agents
- Create/delete dynamic custom agents
- Run one bounded specialist task
- Run parallel task arrays with optional concurrency
- Compact live stdout/stderr tails while child agents run
- Write optional outputs for handoffs or reviews
- Run in `/plan` mode with read-only child tools before plan approval

## Delegation policy

- Call `subagent action=list` before non-trivial delegation.
- Prefer an existing built-in or custom specialist whose description matches the task.
- Create a narrow custom specialist when no matching specialist exists.
- Dynamic specialist prompts should include a description, tool limits, success criteria, escalation rules, and output contract.
- The parent agent remains responsible for synthesis, verification, final decisions, and user-facing communication.
- Do not use subagents for simple tasks that can be handled directly.

## Good uses

- Read-only reconnaissance
- Implementation planning
- Independent code review
- Parallel research
- Bounded implementation handoffs

## Plan-mode safety

When `/plan` is active, subagent runs are restricted to read-only child execution before the plan is approved:

- Child Pi processes are spawned with `--tools read,grep,find,ls`.
- Child prompts explicitly forbid edits, writes, implementation, commits, package installs, server starts, and git state mutation.
- `subagent action=list` and `subagent action=create` remain available.
- `subagent run` and `subagent parallel` are available without `output` files.
- `subagent action=delete` and subagent `output` writes are blocked until the plan is approved.

## Output limits

Live subagent updates are throttled and truncated to recent stdout/stderr tails. Final subagent output is still returned in the tool result and can also be written to an output file for long handoffs.
