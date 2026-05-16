# Triage command

`extensions/triage/` registers `/triage` for label-focused GitHub issue triage.

## Purpose

Use `/triage` when open issues need labels before they are actionable. The command loads open GitHub issues, filters to issues with no labels or the `question` label, shows a TUI selection list, then starts a `/plan` session focused only on label decisions for the selected issue.

## Workflow

1. Run `/triage` inside a GitHub repository with authenticated `gh`.
2. Select an issue from the TUI list.
3. Review the generated `/plan` session.
4. Approve the plan when label decisions are correct.
5. The approved plan may run exact `gh issue edit --add-label` and `gh issue edit --remove-label` commands for that issue only.

## Safety rules

- Candidate filter: open issues with no labels or the `question` label.
- Use existing repository labels only.
- Do not create or delete labels.
- Do not create branches, commits, PRs, or implementation changes.
- Do not close issues, edit issue bodies/titles, assign, milestone, or change state.
- Any missing label suggestion should become a follow-up, not an automatic remote change.

## Validation and rollback

Validate changes with:

```bash
node --test tests/unit/triage-extension.test.mjs
npm run typecheck
npm run lint
```

Rollback/stop point: remove `extensions/triage/` and its docs/nav entry. No local state or migration is required.
