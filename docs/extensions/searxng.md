# SearXNG search

`extensions/searxng/` adds web search support backed by SearXNG.

## Provides

- Agent-facing `search` tool

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

Use the prompt-template `/research <topic>` command for sourced research workflows.
