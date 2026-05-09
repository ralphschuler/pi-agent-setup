# Pretty output

`extensions/pretty-output/` improves user-facing Markdown and tool result rendering.

## Provides

- `/pretty-output on|off|preview`
- Assistant guidance for richer Markdown answers
- Pretty renderers for common built-in tool results
- Compact partial tool updates when a tool reports live output

`/pretty-output off` disables assistant guidance and pretty tool renderers. Tool execution still works; pi falls back to default tool result rendering when no pretty renderer is returned.

## Rendered tools

- `bash`
- `read`
- `edit`
- `write`
- `grep`
- `find`
- `ls`

## Live output limits

Partial updates render only the latest small tail of tool text. Final tool results remain the source of complete context; expand tool cards or use tool-specific log/output commands when available.
