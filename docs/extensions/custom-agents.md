# Custom agents

`extensions/custom-agents/` provides a custom subagent catalog manager.

## Provides

- `/agent` themed catalog UI
- Listing, creating, showing, and deleting custom subagent markdown definitions
- Shared registry helpers for the subagent orchestrator

## Search paths

The catalog uses standard custom-agent folders:

- `~/.pi/agent/agents`
- `~/.agents`
- nearest `.pi/agents`
- nearest legacy `.agents`

## Related pages

- [Subagent orchestrator](subagent-orchestrator.md)
- [Subagents](subagents.md)
