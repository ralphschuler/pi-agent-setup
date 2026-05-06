# Validation and testing

## Repository checks

```bash
bash scripts/check.sh
# or
npm run check
```

`npm run check` runs:

- TypeScript no-emit checking for extensions.
- ESLint.
- Repository-level checks from `scripts/check.sh`.

## Test commands

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:coverage
npm run test:ci
npm run test:docker
```

## Docs build

Install docs dependencies:

```bash
python -m pip install -r requirements-docs.txt
```

Build or serve the wiki through npm scripts:

```bash
npm run docs:build
npm run docs:serve
```

`npm run docs:build` runs `mkdocs build --strict`.

## CI workflows

- `.github/workflows/check.yml` runs repository validation, tests, coverage, and Docker smoke tests.
- `.github/workflows/docs.yml` builds docs on pull requests and deploys to GitHub Pages on pushes to `main`.

## Targeted vs broad validation

Use targeted validation while implementing a focused change, then run the broad sweep before marking the PR ready.

Targeted examples:

```bash
npm run typecheck
npm run lint
npm run test:unit
```

Broad PR validation:

```bash
npm run check
npm run test:ci
npm run docs:build
npm run test:docker
```

`npm run test:ci` already includes `npm run check`, `npm test`, and coverage. Run `npm run docs:build` after docs, navigation, prompt, skill, or extension documentation changes. Run `npm run test:docker` for CI/Docker smoke-test parity when Docker is available. For ACP/editor adapter changes, include `node --test tests/unit/acp-protocol.test.mjs tests/unit/acp-adapter.test.mjs`.

## Before merging changes

Recommended final sweep:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:ci
python -m pip install -r requirements-docs.txt
npm run docs:build
npm run test:docker
```

## Rollout and rollback checks

- Keep README, prompt docs, extension docs, skills docs, and MkDocs nav aligned with shipped behavior.
- Include validation commands in PR bodies and issue handoffs.
- Document rollback/stop points for workflow, tool, skill, prompt, and extension changes.
- Revert docs-only changes if they describe behavior that has not shipped.
