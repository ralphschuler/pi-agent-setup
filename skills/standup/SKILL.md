---
name: standup
description: Create concise repository standup summaries from git state, GitHub issues, and pull requests. Use when asked for standup, status summary, upcoming work, in-progress tasks, blockers, or repo progress.
---

# Standup

Create a concise read-only standup summary for a repository.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.

## Rules

- Stay read-only: do not modify files, issues, PRs, branches, labels, or remote state.
- Use the current repository only unless the user explicitly asks for another repo.
- If `gh` is unavailable or unauthenticated, report setup blockers instead of fabricating GitHub state.
- Prefer evidence from git and GitHub CLI over memory.
- Include links for referenced issues and PRs.
- Keep the final summary concise and action-oriented.

## Workflow

1. Inspect local repo state:
   - `git status --short --branch`
   - `git branch --show-current`
   - `git remote -v`
   - default branch from `git remote show origin`
   - `git log --oneline --decorate -n 10`
2. Inspect GitHub auth and repo:
   - `gh auth status`
   - `gh repo view --json nameWithOwner,url,defaultBranchRef`
3. Inspect GitHub work:
   - `gh issue list --state open --limit 50 --json number,title,labels,updatedAt,url,assignees`
   - `gh issue list --state closed --limit 20 --json number,title,closedAt,url`
   - `gh pr list --state open --limit 50 --json number,title,headRefName,isDraft,updatedAt,url,statusCheckRollup,closingIssuesReferences`
   - `gh pr list --state merged --limit 20 --json number,title,mergedAt,url,closingIssuesReferences`
4. Use `gh issue view` or `gh pr view` for high-priority, blocked, ambiguous, or active items.
5. Classify:
   - completed/recently merged or closed
   - today/in progress
   - blockers/risks
   - upcoming priorities ordered by dependency and actionability
   - repo hygiene
6. If scope/date range is ambiguous and materially affects output, ask one concise `human_in_loop` question with a recommended default.
7. Output the standup summary.

## Output template

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
