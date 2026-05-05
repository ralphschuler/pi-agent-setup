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

- `/welcome` — show the startup welcome card.
- `/ps` — inspect managed background processes.
- `/plan <task>` — start a clarification-first planning workflow.
- `/research <topic>` — research a topic with the SearXNG-backed search tool.
- `/pet` — inspect the Tamagotchi widget state.
- `/web-terminal` — start/show the browser terminal setup.
- `/browser-bridge` — start/show browser bridge setup details.
- `/agent` — manage custom subagent definitions.

## Typical agent workflow

1. Ask pi to inspect the repository.
2. Use `/plan` for non-trivial changes.
3. Approve the plan before edits.
4. Run `npm run check` or deeper tests.
5. Reload pi with `/reload` after extension changes.
