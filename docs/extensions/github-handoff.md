# GitHub handoff

`extensions/github-handoff/` is kept as a compatibility/no-op extension. The GitHub handoff workflows are now prompt templates in `prompts/` so the agent can see and execute the workflow with tools, skills, `human_in_loop`, and subagents.

## Provides prompt-template commands

- `/to-issue [scope]` via `prompts/to-issue.md`
- `/to-pr [scope or title]` via `prompts/to-pr.md`
- `/pick-issue [priority/filter]` via `prompts/pick-issue.md`

The extension intentionally does not register duplicate slash commands, preventing collisions with prompt templates.

## `/to-issue`

Runs an agent workflow to inspect the current repository and conversation, then create GitHub issues with `gh issue create`.

When the conversation contains multiple independent findings or tasks, especially after `/review`, the workflow creates one issue per actionable item and avoids duplicates.

Each issue body should include:

- Summary
- Evidence/context
- Decisions
- Tasks
- Proposed solution
- Acceptance criteria
- Relevant files/commands
- Validation
- Risks/rollback
- Source conversation context

The workflow inspects existing labels with `gh label list`, applies existing labels when appropriate, and uses `human_in_loop` before creating missing labels or issues.

## `/to-pr`

Runs an agent workflow to inspect current changes and conversation context, validate the changes, commit/push when appropriate, and create a pull request with `gh pr create`.

The PR body should include:

- Summary
- Changes
- Validation
- Risks/rollback
- Related issues
- Conversation context

The workflow uses `human_in_loop` before committing or creating a PR when approval is needed.

## `/pick-issue`

Runs an agent workflow to inspect open GitHub issues, pick the next most important actionable issue, create a working branch, and create a draft/WIP PR linked to the issue.

The workflow:

1. Checks repo state and GitHub CLI auth.
2. Reviews open issues with `gh issue list` and `gh issue view`.
3. Selects the highest-priority actionable issue, or asks the user with `human_in_loop` when ambiguous.
4. Outputs the issue details into the session.
5. Requires a clean working tree before branching, or asks how to proceed with `human_in_loop`.
6. Creates and pushes `issue-<number>-<short-slug>`.
7. Creates a draft PR linked to the issue.

## Requirements

These workflows expect the GitHub CLI to be available and authenticated:

```bash
gh auth status
```

If `gh` is unavailable or unauthenticated, the workflow reports setup steps instead of pretending to create issues or PRs.
