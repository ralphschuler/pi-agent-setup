---
name: project-bootstrap
description: Bootstrap new software projects with a repeatable plan, repository hygiene, scripts, documentation, and validation. Use when setting up or standardizing a project repository.
---

# Project Bootstrap

Use this skill when the user asks to initialize, restructure, or standardize a project repository.

If the user invoked a prompt or slash command with arguments, treat those arguments as the requested bootstrap scope, constraints, or goals.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.

## Workflow

1. Inspect the current repository structure before changing files.
2. Identify the project type and existing package/build tools.
3. Create or update common repository hygiene files: README, .gitignore, scripts, docs, and CI as appropriate.
4. Prefer small, composable scripts in `scripts/` over long README-only instructions.
5. Add a validation command that can be run locally and in CI.
6. Run validation before reporting completion.

## Helper

Use `scripts/tree-summary.sh` from this skill directory to print a compact repository tree when useful:

```bash
bash scripts/tree-summary.sh /path/to/repo
```
