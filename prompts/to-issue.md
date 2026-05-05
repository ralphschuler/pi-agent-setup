---
description: Create GitHub issues from current repo and conversation context
argument-hint: "[scope / title / filter]"
---

Issue scope / user arguments:

$ARGUMENTS

---

# GitHub Issue Creation Workflow

Run the `/to-issue` workflow for the current repository and conversation.

If `$ARGUMENTS` is non-empty, treat it as user-provided scope/title/filter. Otherwise infer actionable issues from the conversation.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.
Use `subagent` when independent reconnaissance or review would reduce context load; the parent agent remains responsible for final selection and creation.
Use GitHub CLI commands against the current repository only.

## Goal

Create GitHub issue(s) for actionable work identified in the current conversation and repo context.
If the conversation contains multiple independent findings/tasks, especially after `/review`, create one issue per actionable item.
Do not create duplicate issues for the same task.
Before creating anything, present a human-in-loop selectable review list so the user can choose issues to create, confirm, or cancel.
Show a compact TUI-style progress checklist in assistant output as each step completes.

## Required process

1. Inspect the current git repository, branch, remotes, and GitHub CLI auth status.
2. Review the conversation context for review findings, approved plans, tasks, TODOs, and implementation notes.
3. If needed, inspect relevant repo files before creating issues so each issue is grounded in evidence.
4. Group related sub-points into one issue only when they must be solved together; otherwise split them.
5. Inspect existing open issues with `gh issue list` / `gh issue view` to avoid duplicates.
6. Inspect existing labels with `gh label list`; apply existing labels when appropriate and use `human_in_loop` before creating missing labels.
7. For each issue, prepare a concise title and body with: Summary, Evidence/Context, Decisions, Tasks, Proposed Solution, Acceptance Criteria, Relevant Files/Commands, Validation, Risks/Rollback, and Source Conversation Context.
8. Render a proposed issue list with numbers, titles, one-line summaries, labels, and create/skip recommendation.
9. Use `human_in_loop` select/input/editor to let the user choose which proposed issues to create, confirm all, edit, or cancel. Do not create issues before this confirmation.
10. Use `gh issue create` against the current repo only for confirmed issues. If `gh` is unavailable or unauthenticated, report exact setup steps and do not fake creation.
11. After creation, report created issue URLs and any items intentionally skipped as duplicates/non-actionable.

## TUI-style progress checklist

- [ ] Repo/auth inspected
- [ ] Conversation and files reviewed
- [ ] Existing issues and labels checked
- [ ] Proposed issues drafted
- [ ] Human-in-loop selection confirmed or canceled
- [ ] Confirmed issues created
- [ ] Summary reported

## Safety rules

- Use `human_in_loop` for every user-facing clarification or approval question, including issue selection, creation confirmation, ambiguous target repo, ambiguous labels, or ambiguous issue scope.
- Do not include secrets, private tokens, or unrelated conversation content in issue bodies.
- Do not modify files unless needed for temporary issue body drafts; clean up temporary files afterward.
- Do not create issues in another repository unless the user explicitly asks and confirms.
