# Evolve

`extensions/evolve/` provides a local full-clone-style file variant workflow inspired by `@artale/pi-evolve` without installing third-party packages.

## Provides

- `/evolve [archive|status|list|compare|restore ...]`
- `/mutate <path> <goal>`
- `/darwin <path> <generations> <fitness goal>`
- Agent-facing `evolve` tool with `archive`, `status`, `list`, `compare`, and `restore` actions

## Storage

Archive data is stored as JSON at:

```text
~/.pi/evolve/archive.json
```

Each variant records:

- id
- repository-relative path
- optional label/note
- content
- SHA-256 hash
- byte size
- creation timestamp

## Safety gates

Evolve is local-only and does not install `@artale/pi-evolve` or any third-party evolve package.

The extension denies archive/restore for:

- `.env` files
- credential files
- private keys
- secret-like paths
- large files over the documented limit
- binary files
- paths outside the current repository

Restore writes require explicit approval: the agent must use `human_in_loop` before calling `evolve restore` with `approved=true` or before applying evolved content through file tools.

## Rollback behavior

Before restoring or applying a variant, archive the current file when safe. Use `evolve compare` to inspect differences and `evolve restore` to roll back to an archived variant after `human_in_loop` approval.

## Validation

```bash
node --test tests/unit/evolve*.test.mjs
npm run typecheck
```
