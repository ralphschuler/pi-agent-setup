# SearXNG search

`extensions/searxng/` adds web search and research support backed by SearXNG.

## Provides

- Agent-facing `search` tool
- `/research <topic>` command

## Configuration

By default, the search tool uses:

```bash
http://localhost:8080
```

Set a custom instance with:

```bash
SEARXNG_URL=https://your-searxng.example
```

## Search parameters

- `query`
- `maxResults`
- `categories`
- `engines`
- `language`
- `timeRange`
- `safesearch`

## Research command

```text
/research <topic>
```

The command asks the agent to run focused searches, compare sources, prefer reputable references, and produce a concise synthesis with URL citations.
