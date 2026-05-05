# Skills

Skills are markdown workflows that the agent loads on demand for specialized tasks. When a prompt or slash command supplies arguments, skills treat those arguments as the task scope/focus and preserve them in plans, subagent tasks, and summaries.

## Included skills

| Skill                  | Purpose                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `project-bootstrap`    | Bootstrap or standardize a repository with a repeatable plan, hygiene, scripts, docs, and validation. |
| `code-review`          | Review code changes for correctness, maintainability, tests, security, and user-facing impact.        |
| `systematic-debugging` | Diagnose bugs with an evidence-first root-cause workflow.                                             |
| `pi-processes`         | Manage long-running commands with the custom `process` tool.                                          |
| `pi-subagents`         | Delegate bounded work to custom subagents while keeping parent-agent synthesis.                       |

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
├── pi-processes/SKILL.md
├── pi-subagents/SKILL.md
├── project-bootstrap/SKILL.md
└── systematic-debugging/SKILL.md
```

## Guidance

- Use `code-review` for diffs, pull requests, or implementation plans.
- Use `systematic-debugging` for failing tests, runtime errors, regressions, flakiness, or unclear root causes.
- Use `project-bootstrap` when changing repository standards or setup.
- Use `pi-processes` when starting servers, watchers, or logs.
- Use `pi-subagents` when independent research, planning, implementation, or review would help.
- Ask all user-facing clarification and approval questions through `human_in_loop`; do not ask those questions only in assistant prose.
- When a skill produces a plan, PRD, roadmap, or rollout sequence, split it into independently and quickly testable feature phases with concrete validation commands.
