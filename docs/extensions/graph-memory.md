# Graph memory

`extensions/graph-memory/` gives the agent a durable private knowledge graph.

## Provides

- Agent-facing `graph_memory` tool
- Relevant-memory injection into the system prompt
- Persistent markdown store at `~/.pi/agent/graph-memory.md`

## Use cases

- Stable user preferences
- Project decisions
- Durable facts and relationships
- Important resources and entities

## Agent guidance

The agent should store durable knowledge proactively, but should not store short-lived implementation details unless they define persistent project state or decisions.
