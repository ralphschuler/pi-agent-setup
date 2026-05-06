# Subagent orchestrator

`extensions/subagent-orchestrator/` guides the main agent on when and how to delegate work.

## Provides

- Agent-facing orchestration guidance
- Dynamic subagent creation guidance
- Current custom-agent catalog injection

## Principles

- Use subagents for specialist research, independent review, or parallel context building.
- Call `subagent action=list` before non-trivial delegation to inspect available specialists.
- Create a narrow custom specialist when no matching specialist exists.
- Define dynamic specialists with a description, tool limits, success criteria, escalation rules, and output contract.
- Keep the parent agent responsible for synthesis, verification, final decisions, and user-facing communication.
- Do not use subagents for simple tasks that can be handled directly.
- Avoid concurrent writes to the same files.

## Related pages

- [Custom agents](custom-agents.md)
- [Subagents](subagents.md)
