# Debugging Playbook

## Hypothesis Table

Use a compact table during complex investigations:

| Hypothesis | Evidence For | Evidence Against | Test/Falsifier | Status |
|---|---|---|---|---|
| ... | ... | ... | ... | open/falsified/confirmed |

## Reproduction Template

```text
Command/input:
Expected:
Actual:
Frequency:
Environment:
Relevant logs:
```

## Localization Tactics

- Compare good vs bad inputs.
- Bisect recent changes when history is relevant.
- Trace data from source to sink.
- Check boundaries: empty, null, missing, duplicate, out-of-order, timeout, retry, cancellation.
- Check environment: cwd, env vars, config files, versions, feature flags, permissions.
- Check concurrency: shared mutable state, cleanup order, races, async cancellation, stale caches.

## Validation Tactics

- Run the exact failing command first.
- Add the narrowest regression test possible.
- Run nearby tests that exercise the same code path.
- For flaky bugs, run repeated trials before and after the fix when feasible.
- For performance bugs, capture before/after measurements with the same workload.

## Final Report Template

```markdown
Root cause: ...
Fix: ...
Validation:
- ...
Risks/follow-ups:
- ...
```
