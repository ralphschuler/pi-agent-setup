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

Build the wiki strictly:

```bash
mkdocs build --strict
```

## CI workflows

- `.github/workflows/check.yml` runs repository validation, tests, coverage, and Docker smoke tests.
- `.github/workflows/docs.yml` builds docs on pull requests and deploys to GitHub Pages on pushes to `main`.

## Before merging changes

Recommended minimum:

```bash
npm run check
npm run test:ci
python -m pip install -r requirements-docs.txt
mkdocs build --strict
```
