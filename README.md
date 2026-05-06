# Custom Pi Agent Setup

A custom pi package for a personalized coding-agent environment. It bundles TypeScript extensions, reusable skills, prompt templates, themes, scripts, tests, and a MkDocs-powered wiki.

## Wiki documentation

The full repository wiki lives in `docs/` and is published to GitHub Pages from `main`.

- Local docs source: [`docs/`](docs/)
- Docs config: [`mkdocs.yml`](mkdocs.yml)
- Deployment workflow: [`.github/workflows/docs.yml`](.github/workflows/docs.yml)

To build locally:

```bash
python -m pip install -r requirements-docs.txt
mkdocs build --strict
```

GitHub Pages must be configured with **Settings → Pages → Source → GitHub Actions**.

## Quick install

```bash
npm ci --legacy-peer-deps
npm run check
npm run install:pi
```

Install into the current project only:

```bash
bash scripts/install.sh --local
```

After installing or changing extensions, restart pi or run `/reload`.

## Update and uninstall

```bash
npm run update:pi
npm run uninstall:pi
```

## Validate and test

```bash
npm run check
npm test
npm run test:ci
npm run test:docker
```

## What is included

- `extensions/` — custom pi extensions, tools, commands, TUI widgets, workflows, search, memory, todos, subagents, browser tools, and process management:
  - `extensions/background-processes/`, `extensions/browser-bridge/`, `extensions/caveman/`, `extensions/compact-footer/`, `extensions/cronjobs/`, `extensions/custom-agents/`, `extensions/evolve/`, `extensions/github-handoff/`, `extensions/github-merge/`, `extensions/graph-memory/`, `extensions/human-in-loop/`, `extensions/package-scout/`, `extensions/plan/`, `extensions/pretty-output/`, `extensions/processes/`, `extensions/safety-guard/`, `extensions/searxng/`, `extensions/subagent-orchestrator/`, `extensions/subagents/`, `extensions/tamagotchi/`, `extensions/todo/`, `extensions/web-terminal/`, `extensions/welcome-screen/`
- `skills/` — on-demand workflows for project bootstrap, code review, debugging, GitHub merge, standups, processes, and subagents.
- `prompts/` — reusable prompt templates such as review, research, refine-codebase, to-issue, to-pr, and pick-issue.
- `themes/` — custom TUI themes, including synthwave.
- `scripts/` — install, update, uninstall, validation, and Docker test helpers.
- `tests/` — unit, integration, and e2e tests.
- `docs/` — the full wiki site.

## Common pi commands

```text
/welcome
/plan <task>
/debug <symptom / failing command / bug report>
/review [scope]
/research <topic>
/refine-codebase [scope]
/merge [PR number / URL / branch]
/standup [scope / date / focus]
/evolve [archive|status|list|compare|restore ...]
/mutate <path> <goal>
/darwin <path> <generations> <fitness goal>
/to-issue [scope]
/to-pr [title or scope]
/pick-issue [priority/filter]
/package-scout <package names or query>
/searxng
/ps
/agent
/pet
/browser-bridge
/web-terminal
```

## Repository layout

```text
.
├── .github/workflows/  # CI and docs deployment
├── docs/               # MkDocs wiki source
├── extensions/         # TypeScript pi extensions
├── prompts/            # Prompt templates
├── scripts/            # Setup and validation scripts
├── skills/             # Agent skills
├── tests/              # Test harness
├── themes/             # TUI themes
├── mkdocs.yml
├── package.json
└── README.md
```

See the wiki for full details.
