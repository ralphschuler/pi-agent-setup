# Auto compact

`extensions/auto-compact/` customizes pi compaction summaries so automatic or manual compaction keeps a practical gist of the conversation.

## Provides

- `/auto-compact [on|off|status]`
- `session_before_compact` hook that replaces the default summary when the configured model is available
- Footer status: `🧠 compact gist`

## What it preserves

The summary prompt asks for:

- Goal
- Key decisions, constraints, and preferences
- Done / in-progress / blocked work
- Critical context, exact errors, files, commands, and repo state
- Next steps
- `<read-files>` and `<modified-files>` sections

## Configuration

Defaults use Gemini Flash for cheap summarization:

```bash
PI_AUTO_COMPACT_PROVIDER=google
PI_AUTO_COMPACT_MODEL=gemini-2.5-flash
PI_AUTO_COMPACT_MAX_TOKENS=8192
PI_AUTO_COMPACT_ENABLED=1
```

If the model or auth is unavailable, pi falls back to the built-in compaction behavior.

## Usage

```text
/auto-compact status
/auto-compact off
/auto-compact on
```
