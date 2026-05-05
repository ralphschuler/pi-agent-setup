# Prompts

Prompt templates in `prompts/` become slash commands. Arguments typed after the command are expanded into the Markdown via `$ARGUMENTS`, `$@`, `$1`, `$2`, `${@:N}`, and `${@:N:L}`.

## Included prompts

### `bootstrap.md`

A clarification-first repository bootstrap/improvement workflow. Accepts optional scope/goals via `/bootstrap [scope / goals]`.

It asks the agent to:

1. Inspect structure, metadata, scripts, tests, CI, docs, and existing changes.
2. Clarify scope, constraints, deletion/rename policy, dependency policy, and validation target before editing.
3. Produce a concise reviewable plan with risks and rollback notes.
4. Implement only after approval.
5. Report changed files and commands run.

### `review.md`

A multiagent-style deep technical audit prompt for architecture, backend/API, frontend/UI, security, testing, DevOps, and code quality review. Accepts optional scope, files, PR URL, or focus areas via `/review [scope / files / PR URL / focus areas]`.

Expected output includes an executive summary, risk matrix, concrete findings, GitHub-issue-ready tasks, and recommended implementation order.

### `research.md`

A multiagent-style research prompt for source discovery, technical analysis, security/risk review, alternatives comparison, and implementation planning. Requires a topic/question via `/research <topic or question>`.

Expected output includes sourced findings, confidence levels, risk/tradeoff tables, GitHub-issue-ready tasks, and recommended implementation order.

## Usage examples

```text
/bootstrap improve this repository
/review review my current diff
/research compare deployment options for this repo
```
