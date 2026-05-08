---
description: Implement a feature, fix, or issue with behavior-first vertical slices
argument-hint: "<task / issue / bug / feature scope>"
---

Implementation target / user arguments:

$ARGUMENTS

---

# Behavior-First Implementation Workflow

Run the `/implement` workflow for the current repository. Use the `implement` skill.

Treat `$ARGUMENTS` as the implementation task, issue reference, bug report, or feature scope. If `$ARGUMENTS` is empty, infer the task from the current conversation only when unambiguous; otherwise use `human_in_loop` to ask one concise clarification question with a recommended answer. Do not ask user-facing clarification or approval questions in plain assistant text.

Use `subagent` for non-trivial read-only reconnaissance or independent review when it helps; first call `subagent action=list`, create a narrow custom specialist when no matching specialist exists, and keep implementation, synthesis, verification, and user-facing decisions in the parent agent.

## Goal

Implement the requested behavior safely with vertical TDD-style slices: one behavior, one focused test or check, minimal code, validation, then repeat. Prefer behavior tests through public interfaces over implementation-detail tests.

## Required process

1. Inspect repo state, branch, package manager, available scripts, and relevant files.
2. Frame the requested behavior, public interface, acceptance criteria, likely tests, validation commands, risks, and rollback/stop point.
3. If requirements, public interface, destructive actions, package installs, network exposure, or product behavior are ambiguous, use `human_in_loop` before editing.
4. Plan small feature phases that are independently and quickly testable. Each phase must include behavior, public interface, validation commands/checks, likely files, and rollback/stop point.
5. For each phase:
   - RED: add or update one focused behavior test, or document why test-first is impractical.
   - Run the targeted test/check and capture the expected failure when applicable.
   - GREEN: implement the smallest safe code change.
   - Run the targeted validation and capture the result.
6. Refactor only after tests/checks are green. Remove temporary probes and unrelated cleanup.
7. Run broader validation when practical: related tests, typecheck, lint, format, docs build, or smoke checks.
8. Report exact files changed, tests added/updated, validation results, risks, rollback path, and follow-ups.

## TUI-style progress checklist

- [ ] Repo state and scripts inspected
- [ ] Behavior/public interface framed
- [ ] Ambiguities resolved with human_in_loop when needed
- [ ] Independently and quickly testable feature phases planned
- [ ] RED/GREEN cycles completed or exception documented
- [ ] Refactor completed only after GREEN
- [ ] Targeted and broader validation run or skip reason recorded
- [ ] Result, risks, and rollback reported

## Safety rules

- Do not overwrite or discard local changes.
- Do not use secrets, production systems, destructive actions, package installs, or external network exposure without explicit approval through `human_in_loop`.
- Do not create broad rewrites or speculative features beyond the requested behavior.
- Do not commit, push, create issues, or open PRs unless the user explicitly requests it or invokes the relevant workflow.
- Prefer public-interface behavior tests; avoid tests coupled to private implementation details.
