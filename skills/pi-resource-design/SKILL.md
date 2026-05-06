---
name: pi-resource-design
description: Design Pi prompt templates, skills, extensions, tools, and custom subagents using the repository resource ruleset.
---

# Pi Resource Design

Use this skill when creating or changing Pi resources: prompt templates, skills, extension commands, tools, or custom subagents.

Read and apply `docs/resource-rules.md` before implementation. If a task conflicts with the ruleset, explain the tradeoff and ask via `human_in_loop` before proceeding.

Use `human_in_loop` for every user-facing clarification or approval question. Do not ask those questions in plain assistant text.

## Workflow

1. Identify the user goal, target audience, and expected invocation path.
2. Choose the smallest fitting resource type:
   - prompt template for Markdown slash-command orchestration
   - skill for reusable expert workflow instructions
   - extension command for runtime behavior, TUI, hooks, or command handoff
   - tool for structured bounded actions with schemas/results
   - custom subagent for a missing narrow specialist role
3. Verify metadata/frontmatter requirements:
   - prompts need `description`, `argument-hint`, and `$ARGUMENTS`
   - skills need `name` matching the directory and non-empty `description`
   - extensions need `extensions/<name>/index.ts`
   - tools need a strict schema, description, prompt snippet/guidelines when agent-facing
   - custom subagents need description, tool limits, success criteria, escalation rules, and output contract
4. Add docs in the right place: README, `docs/prompts.md`, `docs/skills.md`, `docs/extensions/`, `mkdocs.yml`, or `docs/resource-rules.md`.
5. Add or update tests for metadata, workflow language, safety checks, helper behavior, and docs/nav reachability.
6. Include security considerations: protected paths, secrets, package installs, network exposure, shell execution, persistence, and approvals.
7. Include validation commands and rollback/stop points.
8. Keep changes small and independently testable.

## Output checklist

When reporting a resource design or implementation, include:

- Resource type chosen and why
- Files changed
- Metadata/frontmatter status
- Docs updated
- Tests updated
- Security considerations
- Validation commands run
- Rollback/stop point

## Stop conditions

Stop and use `human_in_loop` when:

- the resource type is ambiguous and choices have different maintenance/security impact
- the resource would add risky writes, restores, shell execution, package installs, or network exposure
- metadata or docs requirements would be intentionally skipped
- no safe rollback/stop point is available
