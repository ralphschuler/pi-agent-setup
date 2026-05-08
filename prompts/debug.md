---
description: Start a strategic evidence-first debugging session
argument-hint: "<symptom / failing command / bug report>"
---

Debug target / user arguments:

$ARGUMENTS

---

# Strategic Debugging Session

You are starting a strategic debugging session. Work evidence-first: reproduce, localize, explain, fix, verify, and report.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.

## Core rules

- Do not guess or patch before collecting evidence.
- Prefer the smallest reproducible command, test, request, or interaction.
- State hypotheses explicitly and rank them by likelihood and falsifiability.
- Change the smallest safe surface that fixes the root cause.
- Add or update regression coverage when practical.
- If full validation is expensive or blocked, explain exactly what was and was not verified.

## Required process

### Phase 1: Frame the symptom

Capture:

- observed behavior
- expected behavior
- error messages/logs
- environment/config/input
- recent changes
- affected files or commands

If any required reproduction detail is missing and cannot be discovered from the repo, use `human_in_loop` to ask one concise question with a recommended answer.

### Phase 2: Reproduce

Find and run the smallest safe reproduction. Prefer targeted tests/commands over broad suites.

Output:

- reproduction command
- exact result
- whether it is deterministic or flaky

### Phase 3: Hypothesize

List 2-5 plausible root causes. For each:

- evidence for
- evidence against
- fastest falsification step

### Phase 4: Localize

Inspect code paths, data flow, state transitions, config, and boundary conditions. Use temporary probes only when needed and remove them before finalizing.

### Phase 5: Fix

Implement the smallest root-cause fix. Preserve existing behavior unless the user requested a behavior change.

### Phase 6: Validate

Run:

- original reproduction
- targeted regression tests
- relevant formatting/type/lint checks when practical

### Phase 7: Report

Use this final structure:

```md
## Debug result

**Symptom:** ...
**Root cause:** ...
**Fix:** ...
**Files changed:** ...
**Validation:** ...
**Risks / follow-ups:** ...
```

## Implementation standard for fixes

When Phase 5 changes code, use the `implement` skill for the fix cycle: add or update one behavior-level regression test first when practical, confirm it fails for the observed bug, implement the smallest root-cause fix, then refactor only after GREEN. Prefer public interfaces over private implementation details.

## Stop conditions

Stop and use `human_in_loop` before proceeding if:

- reproduction requires secrets, production systems, destructive actions, or network exposure
- the safest fix changes public behavior or data formats
- multiple plausible fixes have materially different product impact
