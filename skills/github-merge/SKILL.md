---
name: github-merge
description: Safely merge an existing GitHub PR by waiting for checks and using a rebase merge. Use when asked to merge a PR, current branch, or `/merge` workflow.
---

# GitHub Merge

Use this skill for safe GitHub PR rebase merges.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.

## Rules

- Merge only an existing PR in the current repository unless the user explicitly confirms another repository.
- Never auto-create a PR.
- Never merge a draft PR.
- Never merge with failed, cancelled, timed-out, or unknown checks.
- Never merge when repo/branch/PR target is ambiguous.
- Prefer `gh pr merge --rebase`.
- Verify the PR is merged after running the command.

## Workflow

1. Inspect repo state and auth:
   - `git status --short --branch`
   - `git remote -v`
   - `git remote show origin`
   - `gh auth status`
2. Identify the PR with `gh pr view --json number,title,url,state,isDraft,headRefName,baseRefName,mergeStateStatus,mergeable,statusCheckRollup`.
3. If checks are running, wait with `gh pr checks --watch` or the `github_rebase_merge` tool.
4. Summarize target, checks, mergeability, and risks.
5. Use `human_in_loop` before merging when approval is needed.
6. Run the merge through `github_rebase_merge` or `gh pr merge --rebase`.
7. Verify final state with `gh pr view --json state,mergedAt,mergeCommit,url`.
8. Report final state and any branch deletion.

## Stop conditions

Stop and report exact blocker when:

- `gh` is unavailable or unauthenticated
- no PR exists for the branch/target
- target PR is draft, closed, already merged, or non-mergeable
- checks fail/cancel/time out/remain unknown
- repo or branch target is ambiguous
- user declines confirmation
