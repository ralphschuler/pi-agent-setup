# Getting started

## Repository purpose

This repository is a pi package for a customized coding-agent environment. It is intended to be installed globally for all pi sessions or locally into a specific project.

## Requirements

- Node.js 22+
- npm
- pi coding agent packages resolved through this repository's dependencies/peer dependencies
- Python 3 for building this wiki with MkDocs Material

## First install

```bash
npm ci --legacy-peer-deps
npm run check
npm run install:pi
```

Restart pi or run `/reload` in an existing session after installing.

## Important runtime commands

- `pi-screen` — start pi through GNU screen for unattended, resumable sessions. Inside a Git repository it auto attaches/creates the repo session; outside a repository it shows a picker for `pi-screen` sessions only.
- `/welcome` — show the startup welcome card.
- `/ps` — inspect managed background processes.
- `/plan <task>` — start a clarification-first planning workflow with quickly testable feature phases.
- `/research <topic>` — run the research prompt with typed arguments passed into the Markdown template.
- `/review <scope>` — review a diff, PR, or plan with structured findings.
- `/debug <problem>` — run evidence-first debugging before changing code.
- `/refine-codebase <scope>` — deepen architecture and maintainability planning.
- `/package-scout <package-or-query>` — audit npm package metadata without installing packages.
- `/searxng` — inspect SearXNG backend health and setup remediation.
- `/pet` — inspect the Tamagotchi widget state.
- `/web-terminal` — start/show the browser terminal setup.
- `/browser-bridge` — start/show browser bridge setup details.
- `/agent` — manage custom subagent definitions and reusable templates.

## Typical agent workflow

1. Ask pi to inspect the repository.
2. Use `/plan` for non-trivial changes and split work into independently, quickly testable phases.
3. Approve the plan before edits; user-facing clarification/approval questions should go through `human_in_loop`.
4. Run `npm run check`, `npm run test:ci`, and docs validation when docs change.
5. Reload pi with `/reload` after extension changes.
