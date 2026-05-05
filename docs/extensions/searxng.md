# SearXNG search

`extensions/searxng/` adds web search support backed by SearXNG.

## Provides

- Agent-facing `search` tool
- Agent-facing `searxng_status` tool
- `/searxng` status/setup command

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

## Status/setup checks

Run:

```text
/searxng
```

The status workflow reports the active backend URL, whether it came from `SEARXNG_URL` or the default, and whether the backend is reachable. If unreachable, it shows remediation steps such as:

```bash
docker run --rm -p 8080:8080 searxng/searxng
export SEARXNG_URL=https://your-searxng.example
```

Agents can call `searxng_status` directly when search fails or setup state is unclear.

Use the prompt-template `/research <topic>` command for sourced research workflows.
