---
description: Start a strategic evidence-first debugging session
argument-hint: "<symptom / failing command / bug report>"
---

Debug target / user arguments:

$ARGUMENTS

---

# Strategic Debugging Session

Use the `systematic-debugging` skill. Treat `$ARGUMENTS` as the symptom, failing command, environment, performance regression, or reproduction scope.

You are starting a disciplined diagnosis loop: build feedback loop → reproduce → minimize → hypothesize → instrument → fix/regression-test → cleanup/post-mortem.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.

## Core rules

- Do not guess or patch before a trusted feedback loop exists.
- Spend disproportionate effort creating a fast, deterministic, agent-runnable pass/fail signal.
- Confirm the loop reproduces the user's bug, not a nearby or invented failure.
- Prefer the smallest reproducible command, test, request, browser script, trace replay, harness, fuzz loop, bisection, or differential check.
- State 3-5 ranked, falsifiable hypotheses before testing them.
- Instrument only to test a specific hypothesis. Change one variable at a time.
- Tag temporary debug logs/probes with a unique prefix like `[DEBUG-a4f2]` and remove them before finalizing.
- For performance regressions, measure first: establish a baseline, use profilers/timing/query plans/bisection, then fix.
- Change the smallest safe surface that fixes the root cause.
- Add or update regression coverage at the correct seam when practical.
- If no correct test seam exists, document that architecture/testing gap explicitly.
- If full validation is expensive or blocked, explain exactly what was and was not verified.

## Required process

### Phase 1: Build the feedback loop

Create the fastest reliable pass/fail signal for the bug. Try, in order where applicable:

1. failing test at the seam that reaches the bug
2. targeted command or CLI invocation with fixture input
3. curl/HTTP script against a local dev server
4. headless/browser interaction with DOM, console, or network assertions
5. replayed trace, payload, event log, HAR, or fixture
6. throwaway harness around the smallest runnable subsystem
7. property/fuzz loop for intermittent wrong output
8. bisection or differential loop across commits/configs/versions
9. structured HITL loop only as a last resort

Make the loop sharper and faster:

- assert the exact symptom, not only "did not crash"
- reduce setup and unrelated initialization
- pin time, seed randomness, isolate filesystem/network where practical
- for flaky bugs, raise reproduction rate with loops, stress, parallelism, timing-window widening, or controlled delays

If no useful loop can be built, stop and use `human_in_loop` to request the missing artifact/access: logs, HAR, trace, dump, screen recording with timestamps, reproducible env, or approval for temporary instrumentation.

### Phase 2: Reproduce and minimize

Run the loop until the bug appears.

Capture:

- observed behavior
- expected behavior
- exact error/output/timing/logs
- reproduction command/check
- determinism or flake rate
- environment/config/input
- recent changes
- affected files or commands

Minimize the loop to the smallest scenario that still proves the same user-reported failure.

### Phase 3: Hypothesize

List 3-5 plausible root causes. For each:

- ranking
- evidence for
- evidence against
- falsifiable prediction: `If <X> is the cause, then <Y> will change the outcome`
- fastest test or probe

Do not proceed with a vibe. Sharpen or discard non-falsifiable hypotheses.

### Phase 4: Instrument and localize

Test hypotheses one at a time.

Prefer:

1. debugger/REPL/breakpoint inspection when available
2. narrow boundary logs tagged with `[DEBUG-...]`
3. focused probes or assertions
4. bisection/differential checks for regressions

Avoid broad "log everything" instrumentation. Remove all temporary probes/logs before finalizing.

### Phase 5: Fix and regression-test

Before fixing, add/update a regression test at the correct seam when practical:

- it exercises the real bug pattern as triggered by callers/users
- it fails before the fix
- it verifies observable behavior through a public interface or stable contract

If no correct seam exists, document that as a finding and proceed with the smallest safe validation available.

Implement the smallest root-cause fix. Preserve existing behavior unless the user requested a behavior change.

### Phase 6: Validate

Run:

- original feedback loop / reproduction
- minimized regression test
- relevant targeted tests
- relevant formatting/type/lint checks when practical
- debug-prefix cleanup check, e.g. `grep -R "\[DEBUG-" <changed paths>` when temporary instrumentation was used

### Phase 7: Cleanup and post-mortem

Before declaring done:

- remove all tagged instrumentation and throwaway prototypes
- state which hypothesis was correct and why
- explain what would have prevented the bug
- if architecture blocked a correct test seam, recommend a focused `/refine-codebase` or `/implement` follow-up

Use this final structure:

```md
## Debug result

**Symptom:** ...
**Feedback loop:** ...
**Root cause:** ...
**Correct hypothesis:** ...
**Fix:** ...
**Regression coverage:** ...
**Files changed:** ...
**Validation:** ...
**Cleanup:** ...
**Risks / follow-ups:** ...
```

## Implementation standard for fixes

When Phase 5 changes code, use the `implement` skill for the fix cycle: add or update one behavior-level regression test first when practical, confirm it fails for the observed bug, implement the smallest root-cause fix, then refactor only after GREEN. Prefer public interfaces over private implementation details.

## Stop conditions

Stop and use `human_in_loop` before proceeding if:

- no trusted feedback loop can be built from available artifacts
- reproduction requires secrets, production systems, destructive actions, or network exposure
- temporary production instrumentation would be needed
- the safest fix changes public behavior or data formats
- multiple plausible fixes have materially different product impact
