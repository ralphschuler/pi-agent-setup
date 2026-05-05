---
description: Create a GitHub pull request from current repo changes and conversation context
argument-hint: "[PR title / scope]"
---

PR title/scope / user arguments:

$ARGUMENTS

---

# GitHub Pull Request Workflow

Run the `/to-pr` workflow for the current repository and conversation.

If `$ARGUMENTS` is non-empty, treat it as user-provided PR title/scope. Otherwise infer the PR title/body from current changes and conversation.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.
Use `subagent` for non-trivial review or validation reconnaissance when it helps; the parent agent remains responsible for the PR plan, final decisions, and user-facing summary.
Use GitHub CLI commands against the current repository only.

## Goal

Create a GitHub pull request for the current repository changes using the conversation as context.
Show a clear TUI-style progress checklist for status inspection, diff review, validation, commit, push, PR creation, and result.
Before committing or creating a PR from inferred changes, present a human-in-loop review list of planned PR actions so the user can confirm or cancel.

## Required process

1. Inspect git status, current branch, remotes, recent commits, and GitHub CLI auth status.
2. Inspect the current diff and relevant conversation context to understand what changed and why.
3. If changes are uncommitted, summarize them and use `human_in_loop` to ask for approval before committing unless the user already explicitly requested commit/push/PR creation.
4. Ensure validation status is known. Run appropriate checks if they have not been run for the current changes, or clearly state why they were skipped.
5. Render a planned PR action list: files/commits included, validation status, branch/base, PR title/body summary, risks, and create/skip recommendation.
6. Use `human_in_loop` select/confirm to let the user confirm the planned PR action list or cancel before commit/PR creation when approval is needed.
7. Choose or create a sensible branch name if not already on a feature branch.
8. Commit changes with a clear message when needed, push the branch, and create a PR with `gh pr create`.
9. PR body must include: Summary, Changes, Validation, Risks/Rollback, Related Issues (if any), and Conversation Context.
10. After creation, report the PR URL, branch, commit(s), validation run, and any follow-up tasks.
11. Keep the TUI-style checklist updated in the final report with completed/skipped/blocked states.

## TUI-style progress checklist

- [ ] Repo/auth inspected
- [ ] Diff and conversation reviewed
- [ ] Validation run or skip reason recorded
- [ ] Planned PR action list confirmed via human_in_loop when needed
- [ ] Branch ready
- [ ] Commit created or existing commits selected
- [ ] Branch pushed
- [ ] PR created
- [ ] Result reported

## Safety rules

- Do not create a PR from dirty or unvalidated changes without clearly reporting what is included.
- Do not include secrets, private tokens, or unrelated conversation content in the PR body.
- If `gh` is unavailable or unauthenticated, report exact setup steps and do not fake PR creation.
- Use `human_in_loop` for every user-facing clarification or approval question, including ambiguous base branch, target repo, commit approval, validation skip, or desired PR scope.
