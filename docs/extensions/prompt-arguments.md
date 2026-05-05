# Prompt arguments

`extensions/prompt-arguments/` registers prompt-template Markdown files as slash commands and expands their arguments before sending the prompt to the agent.

## Provides

- Slash commands for Markdown files in prompt directories, such as `/research <topic>`.
- `description` and `argument-hint` frontmatter in command descriptions.
- Argument substitution for `$1`, `$2`, `$@`, `$ARGUMENTS`, `${@:N}`, and `${@:N:L}`.
- If a template has no placeholders, typed arguments are appended as `User arguments:`.

## Prompt lookup

The extension discovers non-recursive `*.md` templates from:

- `prompts/`
- `.pi/prompts/`
- `~/.pi/agent/prompts/`
- this package's `prompts/`

First match wins by prompt name.

## Example

```markdown
---
description: Research a topic
argument-hint: "<topic>"
---

Research this topic: $ARGUMENTS
```

Usage:

```text
/research compare SearXNG deployment options
```
