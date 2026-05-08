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
Use `subagent` when independent reconnaissance or review would reduce context load; first call `subagent action=list`, create a narrow custom specialist when no matching specialist exists, and keep the parent agent responsible for synthesis, verification, final selection, and creation.
Use GitHub CLI commands against the current repository only.

## Goal

Create GitHub issue(s) for actionable work identified in the current conversation and repo context.
If the conversation contains a plan, PRD, review, or implementation roadmap, break it into tracer-bullet vertical-slice issues: thin end-to-end slices that cut through all needed integration layers and are demoable/verifiable on their own.
Prefer many thin slices over a few thick or horizontal layer-only tickets.
Classify each slice as `AFK` when an agent can implement and merge it without more human interaction, or `HITL` when it requires a human decision, design review, credentials, production access, or other interactive checkpoint. Prefer `AFK` where safe.
Do not create duplicate issues for the same task.
Before creating anything, present a human-in-loop selectable review list so the user can choose issues to create, confirm, edit, split/merge, reorder dependencies, or cancel.
Show a compact TUI-style progress checklist in assistant output as each step completes.

## Required process

1. Inspect the current git repository, branch, remotes, and GitHub CLI auth status.
2. Review the conversation context for review findings, PRDs, approved plans, tasks, TODOs, and implementation notes.
3. If `$ARGUMENTS` names an issue number, issue URL, PRD path, or planning artifact, fetch/read the full source including comments when available before drafting.
4. If needed, inspect relevant repo files, docs, `CONTEXT.md`, and `docs/adr/` before creating issues so each issue uses project domain vocabulary and respects existing decisions.
5. Split work into vertical tracer-bullet slices. Each slice should deliver a narrow but complete path through every required layer such as schema, API, UI, CLI, docs, config, and tests. Avoid horizontal tickets like "build all backend" or "write all tests" unless that layer-only work is independently useful and verifiable.
6. Group related sub-points into one issue only when they must ship together; otherwise split them. Prefer AFK slices; mark HITL only when human interaction is truly required.
7. Identify dependencies between slices. Publish blockers first so later issues can reference real issue IDs in `Blocked by`.
8. Inspect existing open issues with `gh issue list` / `gh issue view` to avoid duplicates and avoid modifying or closing parent/source issues.
9. Inspect existing labels with `gh label list --limit 100` before drafting final issues.
10. For each drafted issue, propose labels from the existing repo labels. Separately list:

- existing labels to apply
- missing labels that would need creation
- labels skipped because they are unnecessary or ambiguous

11. For each issue, prepare a concise title and body using the exact issue body template below.
12. Render a proposed vertical-slice breakdown with numbers, titles, `AFK`/`HITL` type, blocked-by relationships, user stories covered when known, one-line summaries, proposed labels, existing/missing label status, and create/skip recommendation.
13. Use `human_in_loop` select/input/editor to let the user confirm the breakdown or request edits: granularity too coarse/fine, dependency changes, merge/split slices, AFK/HITL changes, issue selection, confirm all, or cancel. Do not create issues before this confirmation; do not create labels before this confirmation either.
14. After issue selection is confirmed, use `human_in_loop` before creating any missing label needed by a confirmed issue. If approved, create it with `gh label create`; if declined, continue with existing labels only.
15. Use `gh issue create --title ... --body-file ... --label ...` against the current repo only for confirmed issues, in dependency order. Apply confirmed existing labels and any user-approved newly created labels. If `gh` is unavailable or unauthenticated, report exact setup steps and do not fake creation.
16. After creation, report created issue URLs, dependency links, AFK/HITL classification, and any items intentionally skipped as duplicates/non-actionable, including skipped label decisions.

## Required issue body template

Each drafted issue body must use these headings:

```md
## Parent

## Summary

## What to build

## Slice Type

## Blocked by

## Evidence/Context

## Decisions

## Tasks

## Proposed Solution

## Acceptance Criteria

## Relevant Files/Commands

## Validation

## Risks/Rollback

## Source Conversation Context
```

## TUI-style progress checklist

- [ ] Repo/auth inspected
- [ ] Source context, issue references, and files reviewed
- [ ] Existing issues and labels checked
- [ ] Vertical-slice breakdown drafted
- [ ] AFK/HITL and dependency review confirmed or canceled via human_in_loop
- [ ] Confirmed issues created in dependency order
- [ ] Summary reported

## Implementation-ready issue standard

Draft acceptance criteria and tasks so each AFK issue can start with `/implement <issue number>`. Prefer vertical behavior slices: one observable end-to-end behavior, one public-interface test/check, minimal implementation, validation command, and rollback/stop point. Avoid broad, untestable batches and horizontal layer-only slices.

## Safety rules

- Use `human_in_loop` for every user-facing clarification or approval question, including issue selection, creation confirmation, ambiguous target repo, ambiguous labels, or ambiguous issue scope.
- Do not include secrets, private tokens, or unrelated conversation content in issue bodies.
- Avoid volatile file paths and code snippets in durable issue descriptions unless they are necessary evidence or a prototype snippet captures a decision more precisely than prose; if included, trim to decision-rich parts.
- Do not modify or close parent/source issues during issue breakdown.
- Do not modify files unless needed for temporary issue body drafts; clean up temporary files afterward.
- Do not create issues in another repository unless the user explicitly asks and confirms.
