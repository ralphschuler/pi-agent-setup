---
description: Pick the next actionable GitHub issue, branch, and draft PR
argument-hint: "[priority / filter]"
---

Priority/filter / user arguments:

$ARGUMENTS

---

# GitHub Issue Pickup Workflow

Run the `/pick-issue` workflow for the current repository.

If `$ARGUMENTS` is non-empty, treat it as the user-provided priority/filter. Otherwise pick the next most important open issue from the repo.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.
Use `subagent` for non-trivial read-only reconnaissance or independent issue scoring when it helps; first call `subagent action=list`, create a narrow custom specialist when no matching specialist exists, and keep the parent agent responsible for synthesis, verification, final selection, and all user-facing decisions.
Use GitHub CLI commands against the current repository only.

## Goal

Select the next most important actionable GitHub issue, create a dedicated working branch, create a WIP/draft PR linked to the issue, and bring the full issue context into this session so implementation can begin.
Show a compact TUI-style progress checklist throughout discovery, selection, dirty-tree handling, branch creation, PR creation, and summary.

## Required process

1. Inspect git status, current branch, remotes, default branch, and GitHub CLI auth status.
2. Use `gh issue list` and `gh issue view` to inspect open issues in the current repo. Consider labels, severity/priority wording, blockers, recency, and dependencies.
3. Select the highest-priority issue that is actionable now. If selection is ambiguous, use `human_in_loop` select to ask the user to choose among 2-5 candidates.
4. Output the selected issue into the session, including title, URL, labels, body summary, acceptance criteria, and relevant files/commands.
5. Ensure the working tree is clean before creating a branch. If dirty, stop and use `human_in_loop` to ask the user how to proceed.
6. Create a branch named like `issue-<number>-<short-slug>` from the default branch or current base after confirming it is safe.
7. Create an empty starter commit before PR creation, e.g. `git commit --allow-empty -m "chore: start issue #<number>"`, so GitHub can create the PR even before implementation changes.
8. Push the branch and create a draft/WIP PR with `gh pr create --draft` (or title prefixed with `WIP:` if draft PRs are unavailable).
9. Link the PR to the issue using closing/linking text in the PR body, e.g. `Closes #<number>` or `Refs #<number>` depending on whether the PR is intended to close it.
10. Report the issue URL, branch, PR URL, and recommended first implementation steps.
11. Keep the TUI-style checklist updated in the final report with completed/skipped/blocked states.

## TUI-style progress checklist

- [ ] Repo/auth inspected
- [ ] Open issues loaded and scored
- [ ] Issue selected or human-in-loop choice confirmed
- [ ] Dirty tree checked and resolved via human_in_loop when needed
- [ ] Branch created
- [ ] Empty starter commit created and branch pushed
- [ ] Draft/WIP PR created and linked
- [ ] Issue context and next steps reported

## Safety rules

- Do not overwrite or discard local changes.
- Do not pick issues from another repository unless the user explicitly asks.
- Do not fake issue or PR creation if `gh` is unavailable or unauthenticated; report exact setup steps.
- Do not start implementation after creating the WIP PR unless the user asks.
- Use `human_in_loop` for every user-facing clarification or approval question, including ambiguous issue selection, dirty-tree handling, target repo, base branch, or whether to close vs reference an issue.
