---
name: systematic-debugging
description: Diagnose and fix bugs with a disciplined evidence-first workflow. Use when investigating failing tests, runtime errors, regressions, flaky behavior, performance issues, or unclear root causes.
---

# Systematic Debugging

Use this skill whenever the task is to investigate or fix a bug. The goal is to avoid guessing: reproduce, localize, explain, fix, and verify.

## Core Workflow

1. **State the symptom**
   - What is observed?
   - What was expected?
   - What changed recently?
   - What environment/config/input triggers it?

2. **Reproduce reliably**
   - Find the smallest command, test, request, or interaction that demonstrates the issue.
   - If reproduction is flaky, run enough times to estimate frequency.
   - Capture exact error messages and relevant logs.

3. **Form hypotheses**
   - List plausible causes.
   - Rank them by likelihood and ease of falsification.
   - Do not patch before testing at least one concrete hypothesis.

4. **Localize with evidence**
   - Inspect call paths, data flow, state transitions, and boundary conditions.
   - Add temporary logging or targeted probes only when needed.
   - Prefer narrow tests or commands over broad manual inspection.

5. **Fix the root cause**
   - Make the smallest safe change that addresses the cause, not just the symptom.
   - Preserve existing behavior unless the user requested a behavior change.
   - Consider edge cases, concurrency, errors, and cleanup paths.

6. **Verify**
   - Re-run the original reproduction.
   - Add or update tests that would fail without the fix.
   - Run targeted regression checks.
   - If full validation is expensive or impossible, explain what was and was not verified.

7. **Report clearly**
   - Symptom
   - Root cause
   - Fix
   - Validation
   - Remaining risks or follow-ups

## Tool Guidance

- Use read/search tools to understand code before editing.
- Use `process` for long-running servers, watchers, or log tails.
- Use `subagent` for parallel investigation when multiple independent hypotheses or subsystems exist.
- Use `todo` for multi-step investigations that may span sessions.
- Use `graph_memory` for durable root causes or project-specific debugging knowledge that should help future sessions.
- Use `human_in_loop` when reproduction steps, expected behavior, or risk tolerance are unclear.

## Anti-Patterns

Avoid:

- Changing code before reproducing or identifying a likely cause.
- Treating the first suspicious code as the root cause without falsification.
- Fixing only the error message while leaving corrupted state or invalid assumptions.
- Adding broad sleeps/retries without explaining why they solve the race or flake.
- Declaring success without re-running the failing scenario.

## Debugging Checklist

Before final response, confirm:

- [ ] Reproduction or best available evidence is documented.
- [ ] Root cause is explained.
- [ ] Fix is minimal and targeted.
- [ ] Original failure path is verified.
- [ ] Regression coverage was added or explicitly deferred.
- [ ] Remaining risks are stated.

See [debugging-playbook.md](references/debugging-playbook.md) for deeper tactics.
