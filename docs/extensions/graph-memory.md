# Graph memory

`extensions/graph-memory/` gives the agent a primary durable private knowledge graph.

## Provides

- Agent-facing `graph_memory` tool
- Relevant-memory injection into the system prompt
- Persistent SQLite store at `~/.pi/agent/graph-memory.sqlite`
- One-time legacy Markdown import from `~/.pi/agent/graph-memory.md`
- Base64-encoded notes for legacy Markdown import/export compatibility

## Use cases

- Stable user preferences
- Durable facts and relationships
- Important resources and entities
- Project decisions

## Agent guidance

The agent should store durable knowledge proactively, but should not store short-lived implementation details unless they define persistent project state or decisions.
