# Skills

Skills are markdown workflows that the agent loads on demand for specialized tasks. When a prompt or slash command supplies arguments, skills treat those arguments as the task scope/focus and preserve them in plans, subagent tasks, and summaries.

## Included skills

| Skill                  | Purpose                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `project-bootstrap`    | Bootstrap or standardize a repository with a repeatable plan, hygiene, scripts, docs, and validation. |
| `code-review`          | Review code changes for correctness, maintainability, tests, security, and user-facing impact.        |
| `systematic-debugging` | Diagnose bugs with an evidence-first root-cause workflow.                                             |
| `pi-processes`         | Manage long-running commands with the custom `process` tool.                                          |
| `pi-resource-design`   | Design Pi prompts, skills, extensions, tools, and subagents using the resource ruleset.               |
| `pi-subagents`         | Delegate bounded work to custom subagents while keeping parent-agent synthesis.                       |
| `github-merge`         | Safely wait for PR checks and merge an existing GitHub PR with rebase.                                |
| `implement`            | Implement features/fixes with behavior-first vertical slices, public-interface tests, and validation. |
| `standup`              | Create read-only repository standup summaries from git state, GitHub issues, and PRs.                 |

## Usage

Use skills directly with slash commands such as:

```text
/skill:project-bootstrap improve this repository
/skill:code-review review my current diff
```

## Skill files

```text
skills/
├── code-review/SKILL.md
├── github-merge/SKILL.md
├── implement/SKILL.md
├── pi-processes/SKILL.md
├── pi-resource-design/SKILL.md
├── pi-subagents/SKILL.md
├── project-bootstrap/SKILL.md
├── standup/SKILL.md
└── systematic-debugging/SKILL.md
```

## Guidance

- Use `code-review` for diffs, pull requests, or implementation plans.
- Use `systematic-debugging` for failing tests, runtime errors, regressions, flakiness, or unclear root causes.
- Use `project-bootstrap` when changing repository standards or setup.
- Use `pi-processes` when starting servers, watchers, or logs.
- Use `pi-resource-design` when creating or changing Pi prompt templates, skills, extensions, tools, or custom subagents.
- Use `pi-subagents` when independent research, planning, implementation, or review would help; list available specialists first, create a narrow custom specialist when no matching specialist exists, and keep parent-agent synthesis/verification.
- Use `github-merge` when merging an existing GitHub PR with checks and rebase merge.
- Use `implement` when building features or fixes with behavior-first, independently and quickly testable vertical slices.
- Use `standup` when summarizing completed, in-progress, blocked, and upcoming repository work.
- Ask all user-facing clarification and approval questions through `human_in_loop`; do not ask those questions only in assistant prose.
- When a skill produces a plan, PRD, roadmap, or rollout sequence, split it into independently and quickly testable feature phases with concrete validation commands.
- When a skill changes shipped workflow behavior, keep README, prompt docs, extension docs, validation docs, and MkDocs nav in sync.
- Include rollback/stop-point notes for generated GitHub issues, PRDs, implementation plans, prompt templates, skills, tools, and extensions.
