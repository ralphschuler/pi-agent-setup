# Loop command

`extensions/loop/` registers `/loop <freeform instructions>`.

## Purpose

`/loop` repeats agent work until the freeform goal is reached or a bounded repetition limit is hit. Each iteration runs in a fresh session so context stays compact, while a small summary carries progress forward.

## Syntax

```text
/loop improve docs until they are clear, max 4 times
/loop keep fixing failing tests until green
```

If no text is provided, the command opens an editor for freeform instructions.

## Limits

- Default maximum: 5 iterations
- Hard cap: 20 iterations
- The max can be inferred from phrases such as `max 4`, `up to 3`, or `5 iterations`.

## Iteration behavior

1. Iteration 1 runs in the current session.
2. Later iterations create a fresh session with `ctx.newSession()`.
3. The new session receives only loop metadata, the original request, and the previous compact summary.
4. The next prompt is sent from the replacement-session context.

## Status protocol

Every looped assistant response must end with:

```text
LOOP STATUS: done|continue
LOOP SUMMARY: compact handoff for the next fresh session
```

Use `LOOP STATUS: done` when the goal is met, progress needs user input, or continuing would be unsafe. Use `LOOP STATUS: continue` only when another iteration should run unattended.

## Stop rules

The loop stops when:

- status is `done`
- max iterations are reached
- `LOOP STATUS` is missing
- `LOOP SUMMARY` is missing for a `continue` status
- creating the next session is cancelled
- an error occurs during the normal agent/tool flow

## Security notes

`/loop` repeats agent turns, not shell commands. Existing tool policies, approval gates, and `human_in_loop` requirements still apply. Loop state is in memory for the current runtime and is not persisted across restarts.
