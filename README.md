# Custom Pi Agent Setup

This repository is a bootstrap pi package for your custom agent setup. It provides:

- `extensions/` — TypeScript pi extensions
- `skills/` — on-demand agent skills
- `prompts/` — reusable prompt templates
- `themes/` — theme examples
- `scripts/` — install, uninstall, update, validation, and Docker test scripts
- `tests/` — unit, integration, and e2e tests with a 100% line-coverage gate

## Install

Install globally for all pi sessions:

```bash
bash scripts/install.sh
# or
npm run install:pi
```

Install into the current project only:

```bash
bash scripts/install.sh --local
```

After installing, restart pi or run `/reload` in an existing session.

## Update

```bash
bash scripts/update.sh
# or
npm run update:pi
```

The update script pulls latest git changes when this folder is a git repo, runs validation, and asks pi to refresh this local package entry.

## Uninstall

```bash
bash scripts/uninstall.sh
# or
npm run uninstall:pi
```

For a project-local install:

```bash
bash scripts/uninstall.sh --local
```

## Validate and test

```bash
bash scripts/check.sh
# or
npm run check

npm test              # unit + integration + e2e tests
npm run test:unit     # unit tests
npm run test:integration
npm run test:e2e
npm run test:coverage # enforces 100% line coverage for the Node test harness
npm run test:ci       # check + tests + coverage gate
npm run test:docker   # Docker build/smoke test
```

## Background processes

This setup includes a custom `process` tool. The agent can start and manage long-running commands such as dev servers, test watchers, build watchers, local APIs, and log tails without blocking the conversation. Use `/ps` to inspect processes.

## Cronjobs

The `cronjob` tool lets the agent schedule durable future work. Jobs are stored in markdown at `~/.pi/agent/cronjobs.md` and are sent back into pi as user messages when due. Supported schedules include ISO timestamps, `every <n> minutes|hours|days`, `daily HH:MM`, and simple 5-field cron expressions.

## Subagents

This setup includes a custom `subagent` tool. The agent can:

- inspect available agents with `subagent({ action: "list" })`
- dynamically create task-specific agents with `subagent({ action: "create", ... })`
- run bounded specialist agents for reconnaissance, planning, implementation handoffs, research, and review
- run independent task arrays in parallel with optional concurrency and output files

The `subagent-orchestrator` extension injects guidance so the main agent uses subagents for specialist research, independent review, and context building while keeping one parent agent responsible for synthesis.

## Included examples

### Extensions

- `extensions/hello-tool/` registers:
  - `/hello-setup` command
  - `hello_setup` tool
  - a small status indicator when loaded
- `extensions/caveman/` registers `/caveman` to toggle caveman language and choose `lite`, `full`, or `ultra` intensity.
- `extensions/safety-guard/` asks before dangerous shell commands such as destructive root deletes.
- `extensions/human-in-loop/` registers:
  - agent-facing `human_in_loop` tool
  - TUI clarification controls for select, confirm, input, and editor prompts
- `extensions/browser-bridge/` registers:
  - `/browser-bridge` command with setup details for connecting another machine's browser
  - agent-facing `browser_bridge` tool for navigation, clicking, typing, page inspection, JavaScript evaluation, and screenshots
  - a Chrome/Edge companion extension under `extensions/browser-bridge/browser-extension/`
- `extensions/web-terminal/` registers:
  - `/web-terminal` command with an authenticated browser/PWA URL
  - agent-facing `web_terminal` setup/status tool
  - a Hyper-inspired xterm.js terminal UI that launches a child `pi -c` session through a pseudo-terminal
- `extensions/background-processes/` adds agent-facing guidance for long-running commands.
- `extensions/processes/` registers the custom `process` tool plus a themed `/ps` process dashboard and custom tool result rendering.
- `extensions/cronjobs/` registers:
  - agent-facing `cronjob` tool
  - persistent markdown schedule storage at `~/.pi/agent/cronjobs.md`
  - one-shot, interval, daily, and simple 5-field cron schedules
- `extensions/custom-agents/` registers:
  - `/agent` command with a themed catalog UI for listing, creating, showing, and deleting custom subagent markdown definitions
  - shared custom-agent catalog helpers using standard custom-agent folders: `~/.pi/agent/agents`, `~/.agents`, nearest `.pi/agents`, and legacy nearest `.agents`
- `extensions/subagent-orchestrator/` adds agent-facing guidance for dynamic subagent creation and delegation, and injects the current custom-agent catalog so agents can reuse or create specialists when missing.
- `extensions/subagents/` registers the custom `subagent` tool plus built-in agents such as `scout`, `planner`, `worker`, `reviewer`, and `researcher`; it supports single-agent and parallel task-array runs with custom TUI rendering.
- `extensions/plan/` registers:
  - `/plan <task>` command
  - clarification-first workflow that blocks writes until the plan is reviewed
  - review UI with apply, refine, or cancel choices
- `extensions/graph-memory/` registers:
  - agent-facing `graph_memory` tool
  - automatic relevant-memory injection into the agent system prompt
  - persistent markdown knowledge graph storage at `~/.pi/agent/graph-memory.md`
- `extensions/todo/` registers:
  - agent-facing `todo` tool
  - automatic active-todo injection into the agent system prompt
  - a TUI widget that appears when there are pending or in-progress tasks
  - persistent markdown storage at `~/.pi/agent/todo.md`

### Skills

- `project-bootstrap` — workflow for standardizing project repositories.
- `code-review` — structured review checklist and response format.
- `systematic-debugging` — evidence-first bug diagnosis and root-cause workflow.
- `pi-processes` — guidance for using the background `process` tool safely for dev servers, watchers, and log tails.
- `pi-subagents` — guidance for orchestrating scout/planner/worker/reviewer subagents, parallel review, and handoff workflows.

Use skills directly with commands such as:

```text
/skill:project-bootstrap improve this repository
/skill:code-review review my current diff
```

### Prompts

Prompt templates in `prompts/` become slash commands when prompt commands are enabled, for example `/review` and `/bootstrap`.

## Repository layout

```text
.
├── extensions/
│   ├── hello-tool/
│   │   └── index.ts
│   ├── caveman/
│   │   └── index.ts
│   ├── background-processes/
│   │   └── index.ts
│   ├── browser-bridge/
│   │   ├── README.md
│   │   ├── browser-extension/
│   │   └── index.ts
│   ├── cronjobs/
│   │   └── index.ts
│   ├── custom-agents/
│   │   ├── index.ts
│   │   └── registry.ts
│   ├── graph-memory/
│   │   └── index.ts
│   ├── human-in-loop/
│   │   └── index.ts
│   ├── plan/
│   │   └── index.ts
│   ├── processes/
│   │   └── index.ts
│   ├── safety-guard/
│   │   └── index.ts
│   ├── subagents/
│   │   └── index.ts
│   ├── subagent-orchestrator/
│   │   └── index.ts
│   ├── todo/
│   │   └── index.ts
│   └── web-terminal/
│       ├── README.md
│       ├── index.ts
│       └── public/
├── skills/
│   ├── code-review/
│   │   └── SKILL.md
│   ├── pi-processes/
│   │   └── SKILL.md
│   ├── pi-subagents/
│   │   └── SKILL.md
│   ├── project-bootstrap/
│   │   ├── SKILL.md
│   │   └── scripts/tree-summary.sh
│   └── systematic-debugging/
│       ├── SKILL.md
│       └── references/debugging-playbook.md
├── prompts/
├── themes/
├── scripts/
├── package.json
└── README.md
```

## Customizing

1. Copy an example under `extensions/` or `skills/`.
2. Rename it.
3. For skills, ensure frontmatter `name` matches the directory name.
4. Run `bash scripts/check.sh`.
5. Run `/reload` in pi.

Pi packages are declared in `package.json` under the `pi` key.
