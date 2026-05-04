# Custom Pi Agent Setup

This repository is a bootstrap pi package for your custom agent setup. It bundles:

- `extensions/` — TypeScript pi extensions
- `skills/` — on-demand agent skills
- `prompts/` — reusable prompt templates
- `themes/` — theme examples
- `scripts/` — install, uninstall, update, and validation scripts

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

## Validate

```bash
bash scripts/check.sh
# or
npm run check
```

## Background processes

This setup bundles `@aliou/pi-processes` and loads its `process` tool. The agent can start and manage long-running commands such as dev servers, test watchers, build watchers, local APIs, and log tails without blocking the conversation. Use `/ps` in the TUI to inspect/manage processes.

## Cronjobs

The `cronjob` tool lets the agent schedule durable future work. Jobs are stored in markdown at `~/.pi/agent/cronjobs.md` and are sent back into pi as user messages when due. Supported schedules include ISO timestamps, `every <n> minutes|hours|days`, `daily HH:MM`, and simple 5-field cron expressions.

## Subagents

This setup bundles `pi-subagents` and loads its `subagent` tool. The agent can:

- inspect available agents with `subagent({ action: "list" })`
- dynamically create task-specific agents with `subagent({ action: "create", ... })`
- run one-off specialists
- run parallel task arrays with `tasks: [...]`
- run chains with sequential and parallel steps

The `subagent-orchestrator` extension injects guidance so the main agent uses subagents for specialist research, independent review, context building, and safe parallel execution while keeping one parent agent responsible for synthesis.

## Included examples

### Extensions

- `extensions/hello-tool/` registers:
  - `/hello-setup` command
  - `hello_setup` tool
  - a small status indicator when loaded
- `extensions/safety-guard/` asks before dangerous shell commands such as destructive root deletes.
- `extensions/human-in-loop/` registers:
  - agent-facing `human_in_loop` tool
  - TUI clarification controls for select, confirm, input, and editor prompts
- `extensions/background-processes/` adds agent-facing guidance for long-running commands.
- `@aliou/pi-processes` is bundled as a dependency and contributes the `process` tool plus `/ps` process management UI.
- `extensions/cronjobs/` registers:
  - agent-facing `cronjob` tool
  - persistent markdown schedule storage at `~/.pi/agent/cronjobs.md`
  - one-shot, interval, daily, and simple 5-field cron schedules
- `extensions/subagent-orchestrator/` adds agent-facing guidance for dynamic subagent creation, chains, and parallel execution.
- `pi-subagents` is bundled as a dependency and contributes the `subagent` tool plus built-in agents such as `scout`, `planner`, `worker`, `reviewer`, `context-builder`, `researcher`, `delegate`, and `oracle`.
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
│   ├── background-processes/
│   │   └── index.ts
│   ├── cronjobs/
│   │   └── index.ts
│   ├── graph-memory/
│   │   └── index.ts
│   ├── human-in-loop/
│   │   └── index.ts
│   ├── plan/
│   │   └── index.ts
│   ├── safety-guard/
│   │   └── index.ts
│   ├── subagent-orchestrator/
│   │   └── index.ts
│   └── todo/
│       └── index.ts
├── skills/
│   ├── code-review/
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
