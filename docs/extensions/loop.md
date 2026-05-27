# Loop command

`extensions/loop/` registers `/loop` for an in-memory prompt loop.

## Purpose

Use `/loop` when you want pi to keep sending the same explicit prompt whenever the agent has finished and is awaiting user input again. The loop is neutral and command-only; it does not run shell commands, read or write files, expose network services, or persist state by itself. The agent response to a repeated prompt can still use tools according to normal pi behavior.

## Commands

- `/loop <prompt>` — start repeating the explicit prompt.
- `/loop` — open a TUI editor for the prompt, then start.
- `/loop start <prompt>` — explicit start form.
- `/loop -- stop doing X` — treat text after `--` as the prompt, even if it looks like a subcommand.
- `/loop status` — show active/inactive state and count.
- `/loop stop` — stop future repeats. It does not abort the currently running agent turn.
- `/loop help` — show usage.

Starting `/loop <prompt>` while a loop is active replaces the current loop and resets the counter.

## Behavior

- The first prompt is sent immediately when pi is idle.
- If pi is busy, the first prompt waits until the current agent turn ends and pi is idle again.
- Each later repeat is scheduled after `agent_end`, waits 5 seconds, starts a new session linked to the previous session as parent, then sends only after the runtime is idle/awaiting user input.
- Repeats are sent as fresh user prompts in the new session, not as steering or follow-up queue messages.
- There is no overlapping send loop.
- Loop state is in-memory only and is cleared on reload, manual session switch, or shutdown. Loop-created new sessions keep the loop active.
- The loop runs until `/loop stop`, but an emergency cap stops it after 50 sent prompts.

## Safety notes

Slash-looking prompts are allowed as explicit prompt text, except prompts starting with `/loop` are refused by policy to avoid recursive loop control. Repeats are delivered as fresh extension-origin user prompts with command/template expansion disabled, so `/plan docs` is repeated as literal prompt text rather than executed as a slash command. Repeated prompts may still spend tokens or lead the agent to use tools. Prefer normal text prompts for long-running loops.

## Validation and rollback

Validate with:

```bash
node --test tests/unit/loop-extension.test.mjs
npm run typecheck
npm run lint
npm run docs:build
```

Rollback/stop point: remove `extensions/loop/`, `tests/unit/loop-extension.test.mjs`, this docs page, and its README/MkDocs/index entries. No persistent state or migration cleanup is required.
