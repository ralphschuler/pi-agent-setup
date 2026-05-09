# Cross-agent discovery

`extensions/cross-agent/` registers compatible resources from other local agent directories without copying or modifying them.

## Scanned locations

On startup and `/reload`, the extension scans user-global and project/ancestor roots:

- `~/.claude/`, `~/.gemini/`, `~/.codex/`
- nearest project/ancestor `.claude/`, `.gemini/`, `.codex/`

## Registered resources

- `commands/` and `prompts/` directories become Pi prompt-template paths.
- `skills/**/SKILL.md` files become Pi skill paths.
- `agents/*.md` files become custom subagents through the existing `/agent` and `subagent` catalog.

## Safety rules

Discovery is read-only. It does not copy files, run scripts, install packages, or mutate external agent directories.

Generated/system/cache/session paths are skipped, including `.system`, `sessions`, `log`, `logs`, `.tmp`, `tmp`, and cache directories. This prevents noisy vendor/system resources from polluting Pi catalogs.

Rollback/stop point: disable or remove `extensions/cross-agent/` if external resource discovery causes catalog noise.
