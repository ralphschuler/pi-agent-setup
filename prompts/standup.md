---
description: Create a repository standup summary from git state, GitHub issues, and PRs
argument-hint: "[scope / date / focus]"
---

Standup scope / user arguments:

$ARGUMENTS

---

# Repository Standup Workflow

Run the standup workflow for the current repository. Use the `standup` skill.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.
Use `subagent` for non-trivial read-only reconnaissance when it helps; first call `subagent action=list`, create a narrow custom specialist when no matching specialist exists, and keep synthesis, verification, and final reporting in the parent agent.

## Goal

Inspect the repository, GitHub issues, and pull requests, then produce a concise standup summary for completed, in-progress, blocked, and upcoming work.

## Required process

1. Inspect repo identity and state:
   - `git status --short --branch`
   - current branch
   - remotes
   - default branch
   - recent commits with `git log --oneline --decorate -n 10`
   - GitHub CLI auth with `gh auth status`
2. Inspect GitHub work for the current repo only:
   - open issues with `gh issue list --state open --limit 50`
   - recently closed issues with `gh issue list --state closed --limit 20`
   - open PRs with `gh pr list --state open --limit 50`
   - recently merged/closed PRs with `gh pr list --state merged --limit 20`
   - use `gh issue view` / `gh pr view` for important or ambiguous items
3. Classify work:
   - Completed since last standup or recent merged/closed work
   - In progress branches/PRs/issues
   - Blocked or risky items
   - Upcoming actionable tasks ordered by priority/dependency
4. Include repository hygiene signals:
   - dirty tree or untracked files
   - current branch vs default branch
   - failing/pending PR checks if any
   - missing `gh` auth/setup blockers
5. If scope, date range, or repo target is ambiguous and cannot be inferred safely, ask exactly one targeted question with `human_in_loop`.
6. Do not modify files, issues, PRs, labels, branches, or remote state. This workflow is read-only.

## Output format

```md
## Standup — <repo> — <date>

### Yesterday / Completed

- ...

### Today / In progress

- ...

### Blockers / Risks

- ...

### Upcoming / Next priorities

1. ...

### Repo hygiene

- Branch: ...
- Working tree: ...
- PR checks: ...

### Links

- Issues: ...
- PRs: ...
```

Keep it concise and action-oriented. Include URLs for referenced issues and PRs.

## Implementation handoff standard

Do not modify files in this workflow. For upcoming work that requires code changes, recommend `/implement <task or issue>` and describe the first independently and quickly testable behavior slice.
