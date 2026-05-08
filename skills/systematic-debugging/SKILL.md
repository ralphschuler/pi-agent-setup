---
name: systematic-debugging
description: Diagnose and fix bugs with a disciplined evidence-first workflow. Use when investigating failing tests, runtime errors, regressions, flaky behavior, performance issues, or unclear root causes.
---

# Systematic Debugging

Use this skill whenever the task is to investigate or fix a bug. The goal is to avoid guessing: build a feedback loop, reproduce, minimize, hypothesize, instrument, fix, verify, cleanup, and learn.

If the user invoked a prompt or slash command with arguments, treat those arguments as the symptom, failing command, environment, performance regression, or reproduction scope.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.

When exploring a codebase, read available domain/context docs such as `CONTEXT.md` and relevant ADRs when present. Use project vocabulary in test names, hypotheses, and reports.

## Core principle

A fast, deterministic, agent-runnable pass/fail signal is the debugging superpower. Spend disproportionate effort building it. Bisection, hypothesis testing, and instrumentation all consume that signal.

Do not proceed to code changes without a feedback loop unless you explicitly document why one cannot be built and use `human_in_loop` for missing artifacts, access, or approval.

## Core Workflow

1. **Build the feedback loop**
   - Prefer a failing test at the seam that reaches the bug.
   - If that is not available, use a targeted command, curl/HTTP script, browser script, replayed trace, throwaway harness, fuzz/property loop, bisection loop, differential loop, or structured HITL loop.
   - Make the loop fast, sharp, and deterministic: assert the exact symptom, reduce setup, pin time, seed randomness, and isolate filesystem/network where practical.
   - For flaky bugs, raise reproduction rate with repeated runs, stress, parallelism, controlled sleeps, or narrowed timing windows.

2. **Reproduce and minimize**
   - Run the loop and watch the user-reported bug appear.
   - Confirm it is the same failure mode the user described.
   - Capture exact error messages, wrong output, timing, logs, inputs, config, and environment.
   - Minimize the scenario while preserving the same bug.

3. **Form hypotheses**
   - List 3-5 plausible causes before testing any single one.
   - Rank by likelihood and ease of falsification.
   - Each hypothesis must include a prediction: `If <X> is the cause, then <Y> will change the outcome`.
   - Discard or sharpen non-falsifiable vibes.

4. **Instrument and localize**
   - Test one hypothesis at a time.
   - Prefer debugger/REPL/breakpoints where available.
   - Add targeted logs only at boundaries that distinguish hypotheses.
   - Tag temporary logs/probes with a unique prefix like `[DEBUG-a4f2]` so cleanup is grepable.
   - Never "log everything and grep".
   - For performance regressions, measure first with a timing harness, profiler, query plan, bisection, or differential run; fix second.

5. **Fix and regression-test**
   - Add or update a regression test before the fix when a correct seam exists.
   - A correct seam exercises the real bug pattern as callers/users trigger it, not a too-shallow implementation detail.
   - Watch the regression test fail, apply the smallest root-cause fix, then watch it pass.
   - If no correct seam exists, document the architecture/testing gap and use the smallest safe validation available.
   - Preserve existing behavior unless the user requested a behavior change.

6. **Verify**
   - Re-run the original feedback loop.
   - Re-run the minimized regression test.
   - Run targeted regression checks and relevant lint/type/format checks when practical.
   - If full validation is expensive or impossible, explain what was and was not verified.

7. **Cleanup and post-mortem**
   - Remove all `[DEBUG-...]` instrumentation and throwaway prototypes.
   - State the hypothesis that turned out correct and why.
   - Explain what would have prevented the bug.
   - If the answer is architectural, recommend a focused `/refine-codebase` or `/implement` follow-up after the fix.

## Tool Guidance

- Use read/search tools to understand code before editing.
- Use `process` for long-running servers, watchers, or log tails.
- Use `subagent` for parallel investigation when multiple independent hypotheses or subsystems exist; first list available specialists for non-trivial delegation.
- Use `todo` for multi-step investigations that may span sessions.
- Use `graph_memory` for durable root causes or project-specific debugging knowledge that should help future sessions.
- Use `human_in_loop` when reproduction steps, expected behavior, artifacts, access, or risk tolerance are unclear.

## Anti-Patterns

Avoid:

- Changing code before reproducing or building a trusted feedback loop.
- Treating the first suspicious code as the root cause without falsification.
- Testing only one hypothesis because it was first or convenient.
- Writing a regression test at a seam too shallow to exercise the real bug pattern.
- Fixing only the error message while leaving corrupted state or invalid assumptions.
- Adding broad sleeps/retries without explaining why they solve the race or flake.
- Adding untagged debug logs or leaving tagged instrumentation behind.
- Declaring success without re-running the original failure scenario.

## Debugging Checklist

Before final response, confirm:

- [ ] Feedback loop is documented, or inability to build one is explained.
- [ ] The reproduced failure matches the user's symptom.
- [ ] Minimal reproduction or best available evidence is documented.
- [ ] 3-5 falsifiable hypotheses were considered.
- [ ] Instrumentation mapped to a specific hypothesis.
- [ ] Root cause is explained.
- [ ] Fix is minimal and targeted.
- [ ] Original failure path is verified.
- [ ] Regression coverage was added or absence of a correct seam is documented.
- [ ] `[DEBUG-...]` instrumentation and throwaway probes are removed.
- [ ] Remaining risks and follow-ups are stated.

See [debugging-playbook.md](references/debugging-playbook.md) for deeper tactics.
