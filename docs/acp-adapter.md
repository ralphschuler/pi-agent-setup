# ACP adapter

`pi-acp` is an experimental stdio adapter for using pi from code editors through the Agent Client Protocol (ACP). The first target is Zed-style ACP clients.

The adapter is repo-local to this Pi package. It does not patch upstream `@mariozechner/pi-coding-agent` and does not add third-party ACP dependencies. Instead, it translates ACP JSON-RPC messages to a child `pi --mode rpc` process.

## Launch model

Editors start the adapter as a stdio command:

```bash
pi-acp
```

The adapter starts pi as:

```bash
pi --mode rpc
```

Any arguments passed to `pi-acp` are forwarded after `--mode rpc`, so advanced users can pass pi CLI options supported by RPC mode.

Example:

```bash
pi-acp --model anthropic/claude-sonnet-4-20250514 --thinking medium
```

## Zed setup

Add a custom ACP agent entry that launches `pi-acp` from this package install. Exact Zed configuration keys can change with ACP releases, but the command should be equivalent to:

```json
{
  "agents": {
    "pi": {
      "command": "pi-acp",
      "args": []
    }
  }
}
```

If `pi-acp` is not on `PATH`, use the absolute path to `bin/pi-acp.mjs` and launch it with Node:

```json
{
  "agents": {
    "pi": {
      "command": "node",
      "args": ["/absolute/path/to/pi-agent-setup/bin/pi-acp.mjs"]
    }
  }
}
```

## Protocol contract

ACP uses JSON-RPC 2.0 over LF-delimited JSON on stdio. The adapter accepts one JSON object per `\n` and emits one JSON object per `\n`. It does not split on generic Unicode line separators.

Supported ACP methods:

| ACP method         | Pi RPC mapping            | Notes                                                  |
| ------------------ | ------------------------- | ------------------------------------------------------ |
| `initialize`       | local response            | Negotiates protocol version `1` and conservative caps. |
| `authenticate`     | local response            | No adapter auth; pi provider auth is managed by pi.    |
| `session/new`      | starts `pi --mode rpc`    | Creates one pi RPC child for the ACP session `cwd`.    |
| `session/prompt`   | `prompt`                  | Text/images are forwarded to Pi RPC.                   |
| `session/cancel`   | `abort`                   | Requests Pi RPC abort for the active turn.             |
| `session/close`    | child process termination | Stops the session child process.                       |
| `session/set_mode` | local no-op               | Accepted for editor compatibility; pi mode unchanged.  |

Unsupported ACP methods return structured JSON-RPC errors and fail closed. Examples: `session/load`, provider configuration, MCP server bridging, terminal delegation, Next Edit Suggestions, document sync, and external file read/write requests from the editor.

## Streaming updates

Pi RPC events become ACP `session/update` notifications:

| Pi RPC event                | ACP update                 |
| --------------------------- | -------------------------- |
| `message_update` text delta | `agent_message_chunk`      |
| `message_update` thinking   | `agent_thought_chunk`      |
| `tool_execution_start`      | `tool_call`                |
| `tool_execution_update`     | `tool_call_update`         |
| `tool_execution_end`        | `tool_call_update`         |
| `agent_end`                 | completes `session/prompt` |

Tool kinds are mapped conservatively: reads as `read`, writes as `edit`, shell/process execution as `execute`, web/browser access as `fetch`, and unknown tools as `other`.

## Human-in-loop and extension UI

Pi RPC can emit `extension_ui_request` for `human_in_loop` and other extension UI methods. The first `pi-acp` slice does not attempt to satisfy those dialogs through ACP. It reports a visible session message and fails closed by sending a cancelled `extension_ui_response` for blocking dialog methods.

This protects approvals and clarification flows from being silently auto-approved or dropped. Continue approval-heavy workflows in a Pi terminal until ACP UI bridging is implemented.

## Security considerations

- Stdio only; no network listener is opened by the adapter.
- The adapter does not log secrets and does not print raw environment variables.
- Editor `cwd` is passed to the Pi RPC child; pi tools still enforce their normal cwd/path behavior.
- Unsupported editor-side filesystem, terminal, provider, MCP, and auth flows fail closed.
- Child `pi --mode rpc` processes are terminated on `session/close`, `SIGINT`, and `SIGTERM`.
- Provider credentials remain in Pi's normal auth storage and environment handling.

## Validation

Targeted checks:

```bash
node --test tests/unit/acp-protocol.test.mjs tests/unit/acp-adapter.test.mjs
npm run check
```

Pre-merge sweep:

```bash
npm run test:unit
npm run test:ci
npm run docs:build
```

## Rollback / stop points

Rollback by removing:

- `bin/pi-acp.mjs`
- `package.json` `bin.pi-acp`
- `docs/acp-adapter.md`
- ACP tests in `tests/unit/`
- README and MkDocs references

If ACP spec changes or Zed requires unsupported capabilities, keep the adapter marked experimental and fail closed for those methods until a narrower follow-up phase is planned.
