---
name: code-review
description: Review code changes for correctness, maintainability, tests, security, and user-facing impact. Use when asked to review a diff, pull request, or implementation plan.
---

# Code Review

When reviewing code, be direct and prioritize actionable findings.

If the user invoked a prompt or slash command with arguments, treat those arguments as the review scope/focus and cite them in the summary.

## Checklist

- Understand the requested behavior and the actual diff.
- Look for correctness bugs, edge cases, data loss risks, and security issues.
- Check whether tests cover the changed behavior.
- Confirm docs, scripts, or examples were updated when behavior changed.
- Avoid nitpicks unless they affect maintainability or consistency.

## Output Format

Use this structure:

1. **Findings** ordered by severity, each with file path and line/context.
2. **Questions** for unclear requirements or risky assumptions.
3. **Summary** of what looks good and what should happen next.

If there are no findings, say so clearly and mention what you checked.
