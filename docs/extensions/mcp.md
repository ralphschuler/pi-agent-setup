# MCP client bridge

The MCP extension adds a trust-gated Model Context Protocol client bridge for Pi.

## Command

```text
/mcp
/mcp status <server>
```

`/mcp` lists configured servers, config paths, transport, source, and trust status. It does not connect to servers or call tools.

## Agent tool

The extension registers one agent-facing gateway tool named `mcp`.

Supported actions:

- `list_servers`
- `list_tools`
- `call_tool`
- `list_resources`
- `read_resource`

Pi does not dynamically register every remote MCP tool in v1. The single gateway keeps trust prompts, timeouts, truncation, and source labels in one place.

## Configuration

The extension reads both locations and never writes config:

- project: `.mcp.json`
- user: `~/.pi/mcp.json`

Project server names override user server names. Project servers always require a per-session trust confirmation before tool/resource access.

### Stdio example

```json
{
  "mcpServers": {
    "local-docs": {
      "transport": "stdio",
      "command": "node",
      "args": ["server.js"],
      "env": {
        "DOCS_ROOT": "docs"
      }
    }
  }
}
```

### HTTP example

```json
{
  "mcpServers": {
    "remote": {
      "transport": "http",
      "url": "https://example.com/mcp"
    }
  }
}
```

### SSE example

```json
{
  "mcpServers": {
    "legacy-sse": {
      "transport": "sse",
      "url": "http://localhost:3000/sse"
    }
  }
}
```

User config can mark a server trusted:

```json
{
  "mcpServers": {
    "personal": {
      "transport": "http",
      "url": "https://example.com/mcp",
      "trusted": true
    }
  }
}
```

`trusted: true` is ignored for project config.

## Safety model

- MCP servers can run commands, read files, and access network resources.
- Untrusted servers require confirmation before first use each session.
- Non-interactive sessions fail closed when confirmation is required.
- Secrets in env/header-like fields are not displayed in tool details.
- Tool output is redacted for common secret key names and truncated.
- Requests use bounded timeouts and abort signals.
- Stdio server stderr is piped instead of inherited.

## Validation

```bash
npm run test:unit -- mcp-extension
npm run typecheck
npm run lint
npm run docs:build
```

## Rollback / stop point

Disable `extensions/mcp/` registration or remove the extension directory to stop MCP access. If transport safety is insufficient, keep `list_servers` only and disable call/read actions.
