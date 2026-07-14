# Graph memory

`extensions/graph-memory/` gives the agent a primary durable private knowledge graph.

## Provides

- Agent-facing `graph_memory` tool
- Relevant-memory injection into the system prompt
- Persistent SQLite store at `~/.pi/agent/graph-memory.sqlite`
- One-time legacy Markdown import from `~/.pi/agent/graph-memory.md`
- Base64-encoded notes for legacy Markdown import/export compatibility
- UUID node IDs with transactional migration and private pre-migration SQLite backups
- Private SQLite directory/file permissions (`0700`/`0600`)

## Use cases

- Stable user preferences
- Durable facts and relationships
- Important resources and entities
- Project decisions

## Agent guidance

The agent should store durable knowledge proactively, but should not store short-lived implementation details unless they define persistent project state or decisions. Node IDs are opaque UUIDs; titles are the supported lookup key. The migration is breaking: old slug IDs are not retained as aliases.
