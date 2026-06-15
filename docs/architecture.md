# Architecture

## Package layout

```text
.
├── extensions/   # TypeScript pi extensions
├── skills/       # On-demand agent skills
├── prompts/      # Reusable prompt templates
├── themes/       # pi TUI themes
├── scripts/      # install/update/uninstall/check/test helpers
├── tests/        # Node test harness
├── docs/         # MkDocs wiki source
└── .github/      # GitHub Actions workflows
```

## Extension discovery

The `package.json` `pi` block points pi at top-level resource directories. Extensions under `extensions/<name>/index.ts` are auto-discovered as package resources.

## Extension responsibilities

Extensions can register:

- Agent-facing tools, such as `process`, `search`, `cronjob`, `todo`, and `graph_memory`.
- Slash commands, such as `/plan`, `/ps`, `/research`, `/welcome`, and `/analyze`.
- TUI widgets/status entries.
- Prompt/system-context guidance for the agent.
- Runtime event handlers for safety, workflow, or UI behavior.

## Persistent state

Several extensions store durable agent state outside the repository:

- Cronjobs: `~/.pi/agent/cronjobs.md`
- Graph memory: `~/.pi/agent/graph-memory.sqlite`
- Todo list: `~/.pi/agent/todo.md`

## Documentation site

The wiki is built from `docs/` with MkDocs Material. The `docs.yml` workflow builds it strictly on pull requests and publishes it to GitHub Pages on pushes to `main`.
