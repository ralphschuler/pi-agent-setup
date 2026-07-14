# Custom agents

`extensions/custom-agents/` provides a custom subagent catalog manager.

## Provides

- `/agent` themed catalog UI
- Listing, creating, showing, and deleting custom subagent markdown definitions
- Reusable custom-agent templates installable into the project or user catalog
- Shared registry helpers for the subagent orchestrator

## Commands

```text
/agent
/agent list
/agent new
/agent templates
/agent install-template <name> [user|project]
/agent show <name>
/agent delete <name>
```

## Reusable templates

Built-in templates are available for:

- `security-reviewer` — security, privacy, auth, secrets, supply-chain, and operational risk review.
- `docs-maintainer` — docs, READMEs, wiki pages, examples, and user-facing workflow guidance.
- `release-manager` — changelog, validation gates, rollout, rollback, and post-release checks.
- `browser-qa` — browser-facing behavior, UI flows, accessibility basics, and visual regressions.
- `dependency-auditor` — package metadata, license, freshness, supply-chain risk, and install policy.

Install a project template:

```text
/agent install-template security-reviewer project
```

Install a user template:

```text
/agent install-template docs-maintainer user
```

Each template defines role, scope, success criteria, escalation rules, and output contract.

## Context defaults

Custom-agent frontmatter may set `defaultContext`:

- `fresh` — default isolated subagent run.
- `fork` — requests `contextMode: "recent"`, which sends a bounded redacted parent-context handoff to the child prompt. This is not a true session fork.
- `readOnly: true` — declares that the agent may run during `/plan`; absent or false is treated as not read-only.

Parent agents should use the child agent's synthesized summary/result instead of copying raw conversation history into the parent context.

## Search paths

The catalog uses standard custom-agent folders:

- `~/.pi/agent/agents`
- `~/.agents`
- nearest `.pi/agents`
- nearest legacy `.agents`

## Related pages

- [Subagent orchestrator](subagent-orchestrator.md)
- [Subagents](subagents.md)
