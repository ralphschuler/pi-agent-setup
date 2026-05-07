---
description: Safely wait for checks and rebase-merge the current GitHub PR
argument-hint: "[PR number / URL / branch]"
---

Merge target / user arguments:

$ARGUMENTS

---

# GitHub Rebase Merge Workflow

Run the `/merge` workflow for the current repository.

Use the `github-merge` skill and the `github_rebase_merge` tool. Treat invoking `/merge` as approval to merge the identified PR when the target is unambiguous, the tree is clean, checks pass, and mergeability is safe. Use `human_in_loop` for every user-facing clarification or approval question outside that normal safe path. Do not ask those questions in plain assistant text.

## Goal

Operate only on an existing open PR for the current repository/branch or for the explicit `$ARGUMENTS` target, wait for all required PR checks, show compact live progress while checks run, and merge with `gh pr merge --rebase`.

## Required process

1. Inspect `git status --short --branch`, current branch, remotes, default branch, and `gh auth status`.
2. Identify exactly one existing open PR using `gh pr view --json number,headRefName,mergeStateStatus,mergeable,statusCheckRollup,url,isDraft,state,title`.
3. Stop if there is no PR, multiple possible PRs, a closed PR, a draft PR, a dirty tree that could confuse the target, a non-mergeable PR, failed checks, missing `gh`, unauthenticated `gh`, ambiguous repo/branch, or another blocker that makes the safe path invalid.
4. If checks are pending, wait for them with compact live TUI-style progress bars or `gh pr checks --watch`, keeping output truncated.
5. Summarize the planned merge: PR URL, title, base/head, mergeability, checks, branch deletion behavior, and command `gh pr merge --rebase`.
6. Do not ask an extra confirmation before merging on the normal unambiguous safe path; the `/merge` invocation is approval for that path.
7. Call `github_rebase_merge` for the target PR. The tool must wait for checks, verify mergeability, run `gh pr merge --rebase`, and verify final merged state.
8. Report final PR state, merge commit, deleted branch status, and any skipped steps.

## TUI-style progress checklist

- [ ] Repo/auth inspected
- [ ] Existing PR identified
- [ ] Merge blockers checked
- [ ] Checks passed or watched to completion
- [ ] Merge approved by `/merge` invocation or via human_in_loop when needed
- [ ] Rebase merge executed
- [ ] Final merged state verified

## Safety rules

- Do not auto-create a PR.
- Do not merge a draft PR.
- Do not merge if checks fail, are cancelled, or are unknown after timeout.
- Do not merge a PR from another repository unless explicitly requested and confirmed.
- Do not ask approval questions in plain assistant text; use `human_in_loop`.
