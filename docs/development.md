# Development

## Setup

```bash
npm ci --legacy-peer-deps
npm run check
```

## Extension development

Extensions live under `extensions/<name>/index.ts` and export a default function that receives the pi extension API.

Typical extension capabilities:

- Register a tool with `pi.registerTool()`.
- Register a slash command with `pi.registerCommand()`.
- Subscribe to lifecycle/tool/session events.
- Inject system-prompt guidance.
- Render TUI status/widgets.

After editing extensions, run:

```text
/reload
```

## Adding documentation

Wiki pages live in `docs/` and navigation is controlled by `mkdocs.yml`.

For new features:

1. Add or update the relevant page under `docs/`.
2. Add a navigation entry in `mkdocs.yml` if the page is new.
3. Run `mkdocs build --strict`.

## GitHub Pages deployment

The docs workflow deploys on pushes to `main` using official GitHub Pages actions. Repository settings must use:

```text
Settings → Pages → Source → GitHub Actions
```

## Dependency policy

Runtime package resources should rely on dependencies available in this repository or pi packages. Keep docs tooling isolated in `requirements-docs.txt`.

## Pre-commit checklist

```bash
npm run check
npm run test:ci
python -m pip install -r requirements-docs.txt
mkdocs build --strict
```
