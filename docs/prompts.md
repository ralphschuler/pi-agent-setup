# Prompts

Prompt templates in `prompts/` become slash commands when prompt commands are enabled.

## Included prompts

### `bootstrap.md`

A clarification-first repository bootstrap/improvement workflow.

It asks the agent to:

1. Inspect structure, metadata, scripts, tests, CI, docs, and existing changes.
2. Clarify scope, constraints, deletion/rename policy, dependency policy, and validation target before editing.
3. Produce a concise reviewable plan with risks and rollback notes.
4. Implement only after approval.
5. Report changed files and commands run.

### `review.md`

A structured repository-change review prompt focused on:

- Correctness and edge cases
- Test coverage and validation gaps
- Security and privacy impact
- Maintainability, docs, and user-facing behavior

Expected output includes prioritized findings, questions, and a short summary.

## Usage examples

```text
/bootstrap improve this repository
/review review my current diff
```
