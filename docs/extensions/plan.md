# Plan workflow

`extensions/plan/` registers `/plan <task>`.

## Purpose

The plan workflow enforces deep drilldown planning before implementation for non-trivial tasks. It behaves like a rigorous design interview: resolve each branch of the decision tree, inspect the codebase before asking discoverable questions, and ask one targeted question at a time when user input is required. Its PRD path synthesizes from the approved plan and existing context instead of re-interviewing the user.

## Provides

- Deep drilldown planning phases
- One-question-at-a-time clarification with recommended answers
- Codebase reconnaissance before asking discoverable questions
- Decision-tree and risk-sweep coverage
- Reviewable plan output
- Write blocking until plan approval, including indirect Bash and subagent write paths
- Review UI with apply, change, dynamic write/update `PRD.md`, or cancel choices
- PRD generation with problem statement, solution, user stories, implementation decisions, testing decisions, feature phases, out-of-scope items, and further notes

## Planning safety boundary

Before approval, `/plan` permits read-only inspection, `human_in_loop`, `todo`, and `graph_memory` metadata operations. Bash is restricted to a fail-closed inspection command set; shell indirection, redirects, package installs, and write-capable commands are blocked. Subagent creation/deletion, output files, and agents without explicit `readOnly: true` metadata are blocked.

Built-in read-only planning agents are `scout`, `planner`, `reviewer`, and `researcher`. Custom agents must declare `readOnly: true` in frontmatter to run during planning; absent metadata defaults to not read-only.

## Recommended use

Use `/plan` before changes that affect architecture, workflows, multiple files, deployment, security, data handling, or user-facing behavior.

## Planning phases

1. Frame the objective, success criteria, non-goals, and affected surfaces.
2. Inspect relevant files, docs, tests, and config before asking user questions.
3. Walk the decision tree one branch at a time.
4. Ask targeted questions only when needed, always with a recommended answer.
5. Sweep risks: correctness, security, data loss, performance, compatibility, UX, operations, and rollback.
6. Produce `READY FOR REVIEW` only when coverage is complete.

## Review choices

At the review gate, choose one of:

- **Apply the plan** — begin implementation.
- **Change the plan** — provide feedback and continue planning.
- **Write PRD.md** / **Update PRD.md** — convert the approved plan into `PRD.md` without implementation. The review UI says **Write PRD.md** when no `PRD.md` file exists and **Update PRD.md** when `PRD.md` already exists. The generated PRD uses project vocabulary from context/docs/ADRs when available, identifies deep-module opportunities and behavior-focused test targets, avoids volatile file paths in durable implementation decisions, and keeps feature phases independently and quickly testable.
- **Cancel planning** — stop the workflow.
