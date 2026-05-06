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

## Output limits

Live subagent updates are throttled and truncated to recent stdout/stderr tails. Final subagent output is still returned in the tool result and can also be written to an output file for long handoffs.
