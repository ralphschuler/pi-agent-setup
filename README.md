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

## Included examples

### Extensions

- `extensions/hello-tool/` registers:
  - `/hello-setup` command
  - `hello_setup` tool
  - a small status indicator when loaded
- `extensions/safety-guard/` asks before dangerous shell commands such as destructive root deletes.
- `extensions/graph-memory/` registers:
  - agent-facing `graph_memory` tool
  - automatic relevant-memory injection into the agent system prompt
  - persistent markdown knowledge graph storage at `~/.pi/agent/graph-memory.md`
- `extensions/todo/` registers:
  - `/todo` command
  - `todo` tool
  - a TUI widget that appears when there are pending or in-progress tasks
  - persistent markdown storage at `~/.pi/agent/todo.md`

### Skills

- `project-bootstrap` — workflow for standardizing project repositories.
- `code-review` — structured review checklist and response format.

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
│   ├── graph-memory/
│   │   └── index.ts
│   ├── safety-guard/
│   │   └── index.ts
│   └── todo/
│       └── index.ts
├── skills/
│   ├── code-review/
│   │   └── SKILL.md
│   └── project-bootstrap/
│       ├── SKILL.md
│       └── scripts/tree-summary.sh
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
