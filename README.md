# Custom Pi Agent Setup

A custom pi package for a personalized coding-agent environment. It bundles TypeScript extensions, reusable skills, prompt templates, themes, scripts, tests, a MkDocs-powered wiki, and the experimental `pi-acp` editor adapter.

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

The installer exposes `pi-acp` and `pi-screen` through managed executable wrappers in `~/.local/bin` and adds that directory to your shell startup file. Open a new shell or source the updated rc file, then smoke check:

```bash
pi-acp --help
pi-screen --help
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

Fast local checks:

```bash
npm run typecheck
npm run lint
npm run check
npm run test:unit
```

Full pre-merge sweep:

```bash
npm run test:ci
npm run docs:build
npm run test:docker
```

## What is included

- `bin/pi-acp.mjs` — experimental Agent Client Protocol (ACP) stdio adapter for Zed-style code editor integration via `pi --mode rpc`.
- `bin/pi-screen.mjs` — GNU screen wrapper for unattended, resumable pi sessions. Inside a Git repository it auto attaches/creates the repo session; outside a repository it shows a picker for `pi-screen` sessions only.
- `extensions/` — custom pi extensions, tools, commands, TUI widgets, workflows, search, memory, todos, subagents, browser tools, and process management:
  - `extensions/background-processes/`, `extensions/browser-bridge/`, `extensions/caveman/`, `extensions/compact-footer/`, `extensions/cronjobs/`, `extensions/cross-agent/`, `extensions/custom-agents/`, `extensions/evolve/`, `extensions/github-handoff/`, `extensions/github-merge/`, `extensions/graph-memory/`, `extensions/human-in-loop/`, `extensions/package-scout/`, `extensions/plan/`, `extensions/pretty-output/`, `extensions/processes/`, `extensions/safety-guard/`, `extensions/searxng/`, `extensions/secret-redaction/`, `extensions/subagent-orchestrator/`, `extensions/subagents/`, `extensions/todo/`, `extensions/wait/`, `extensions/web-terminal/`, `extensions/welcome-screen/`
- `skills/` — on-demand workflows for `project-bootstrap`, `code-review`, `systematic-debugging`, `github-merge`, `implement`, `standup`, `pi-processes`, `pi-subagents`, and `pi-resource-design`.
- `prompts/` — reusable prompt templates such as analyze, review, research, refine-codebase, merge, standup, to-issue, to-pr, and pick-issue.
- `themes/` — custom TUI themes, including synthwave.
- `scripts/` — install, update, uninstall, validation, and Docker test helpers.
- `tests/` — unit, integration, and e2e tests.
- `docs/` — the full wiki site.

## Common pi commands

```text
pi-screen
/welcome
/plan <task>
/analyze <symptom / failing command / bug report>
/review [scope]
/research <topic>
/refine-codebase [scope]
/merge [PR number / URL / branch]
/implement <task / issue / bug / feature scope>
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
/browser-bridge
/web-terminal
```

## Repository layout

```text
.
├── .github/workflows/  # CI and docs deployment
├── bin/                # Executable adapters such as pi-acp
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
