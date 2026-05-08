---
name: implement
description: Implement features or fixes with behavior-first tests, vertical TDD slices, validation, and rollback notes. Use when asked to build, change, fix, or complete implementation work.
---

# Implementation Workflow

Use this skill for implementation work: new features, bug fixes, refactors with behavior changes, issue work, and PR follow-up tasks.

Inspired by test-driven development. Default to behavior-first, public-interface tests and red-green-refactor cycles unless the project lacks test infrastructure or the change is docs/config-only.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.

## Core principles

- Verify behavior through public interfaces, not private implementation details.
- Prefer integration-style or contract-style tests for real code paths.
- Avoid over-mocking internals. Mock only true boundaries: network, time, randomness, external services, expensive IO, or dangerous side effects.
- Work in vertical slices: one behavior, one failing test, minimal implementation, validation, then repeat.
- Never write all tests first and all code later.
- Never refactor while RED. Get GREEN first, then refactor with tests passing.
- Keep interfaces small and implementations deep when adding or changing modules.
- Do not add speculative features, broad rewrites, or unrelated cleanup.

## Required process

### 1. Frame the task

Identify:

- requested behavior or fix
- public interface/user-facing path
- affected files and likely test locations
- existing patterns to follow
- validation commands available
- rollback/stop point

If the public interface, acceptance criteria, data migration, destructive action, production dependency, or test priority is unclear and cannot be inferred safely, stop and use `human_in_loop` with concise options.

### 2. Plan vertical slices

Create a short plan with small feature phases. Each phase must be independently and quickly testable.

For each phase include:

- behavior to prove
- public interface exercised
- test command/check
- implementation files likely touched
- rollback/stop point

### 3. Red-green loop

For each behavior:

1. RED: add or update one focused failing test that describes observable behavior.
2. Run the targeted test and confirm the expected failure.
3. GREEN: write the minimal implementation needed to pass.
4. Run the targeted test and confirm pass.
5. Repeat for the next behavior.

If writing a test first is impractical, state why, then use the smallest reproducible validation before implementation and add regression coverage as soon as practical.

### 4. Refactor

After tests are GREEN:

- remove duplication
- simplify names and control flow
- deepen modules where a smaller interface can hide complexity
- remove temporary probes/logging
- run tests after each meaningful refactor step

### 5. Validate

Run targeted validation first, then broader checks when practical:

- changed tests
- related tests
- typecheck/lint/format checks
- docs build or smoke checks when docs/runtime behavior changed

If any validation is skipped, report why and what risk remains.

## Per-cycle checklist

```md
- [ ] Test describes behavior, not implementation
- [ ] Test uses public interface or stable contract
- [ ] Test fails for the expected reason before implementation
- [ ] Code is minimal for this behavior
- [ ] Targeted validation passes
- [ ] No speculative behavior added
```

## Stop conditions

Stop and use `human_in_loop` before proceeding if:

- requirements imply public API, data format, permission, or migration changes not confirmed by the user
- the safest fix has materially different product behavior than requested
- implementation requires secrets, production systems, destructive actions, package installs, or network exposure
- tests require external paid/production services and no safe fake/stub exists
- multiple viable designs have different maintenance/security impact

## Output format

```md
## Implementation result

**Task:** ...
**Approach:** behavior-first vertical slices / exception noted
**Files changed:** ...
**Tests added/updated:** ...
**Validation:** ...
**Risks / rollback:** ...
**Follow-ups:** ...
```
