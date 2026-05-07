# GitHub merge

`extensions/github-merge/` provides the agent-facing `github_rebase_merge` tool for safe GitHub PR rebase merges.

## Tool

| Tool                  | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `github_rebase_merge` | Wait for PR checks, run `gh pr merge --rebase`, and verify merge. |

The extension does not register a `/merge` command. `/merge` is provided by `prompts/merge.md`.

## Safety behavior

The tool stops on:

- missing PR
- closed or draft PR
- non-mergeable PR
- failed/cancelled/timed-out checks
- checks still pending after timeout
- failed `gh` command
- final PR state not merged after merge command

For `/merge`, invoking the prompt is approval for the normal unambiguous safe path: exactly one current-repo PR, clean target state, non-draft, mergeable, and all checks passing or watched to success. The prompt workflow should use `human_in_loop` only when clarification or non-standard approval is needed.

## Validation

```bash
node --test tests/unit/github-merge-tool.test.mjs
node --test tests/unit/merge-prompt.test.mjs
```
