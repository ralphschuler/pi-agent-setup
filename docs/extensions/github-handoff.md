# GitHub handoff

`extensions/github-handoff/` registers commands that convert conversation and repository context into GitHub artifacts.

## Provides

- `/to-issue [scope]`
- `/to-pr [scope or title]`
- `/pick-issue [priority/filter]`

## `/to-issue`

Queues an agent workflow to inspect the current repository and conversation, then create GitHub issues with `gh issue create`.

When the conversation contains multiple independent findings or tasks, especially after `/review`, the workflow creates one issue per actionable item and avoids duplicates.

Each issue body should include:

- Summary
- Evidence/context
- Proposed solution
- Acceptance criteria
- Relevant files
- Source conversation context

## `/to-pr`

Queues an agent workflow to inspect current changes and conversation context, validate the changes, commit/push when appropriate, and create a pull request with `gh pr create`.

The PR body should include:

- Summary
- Changes
- Validation
- Risks/rollback
- Related issues
- Conversation context

## `/pick-issue`

Queues an agent workflow to inspect open GitHub issues, pick the next most important actionable issue, create a working branch, and create a draft/WIP PR linked to the issue.

The workflow:

1. Checks repo state and GitHub CLI auth.
2. Reviews open issues with `gh issue list` and `gh issue view`.
3. Selects the highest-priority actionable issue, or asks the user when ambiguous.
4. Outputs the issue details into the session.
5. Requires a clean working tree before branching.
6. Creates and pushes `issue-<number>-<short-slug>`.
7. Creates a draft PR linked to the issue.

## Requirements

These commands expect the GitHub CLI to be available and authenticated:

```bash
gh auth status
```

If `gh` is unavailable or unauthenticated, the workflow reports setup steps instead of pretending to create issues or PRs.
