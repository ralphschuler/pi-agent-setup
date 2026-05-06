# Pi resource creation rules

Use this ruleset before creating or changing Pi prompt templates, skills, extensions, tools, or custom subagents.

## Resource choice

| Need                                                                          | Choose            | Why                                                                                                                          |
| ----------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Guide an agent through a repeatable slash-command workflow                    | Prompt template   | Prompt templates are visible as slash commands and can instruct tool/skill usage without TypeScript runtime code.            |
| Provide reusable task-specific operating instructions                         | Skill             | Skills are loaded on demand and work well for reviews, debugging, processes, merge workflows, and other specialized methods. |
| Add runtime behavior, UI, hooks, command handlers, or tool registration       | Extension command | Extensions can listen to events, register slash commands, show TUI components, and inject system guidance.                   |
| Let the agent perform a bounded machine action with structured inputs/outputs | Tool              | Tools should expose one clear capability with schemas, truncation, details, and safe rendering.                              |
| Delegate bounded specialist work with separate context                        | Custom subagent   | Subagents fit independent reconnaissance, review, planning, research, or implementation handoffs.                            |

## Prompt templates

Use prompts when the outcome is mostly orchestration and can be described in Markdown.

Requirements:

- Store under `prompts/<name>.md`.
- Include frontmatter with `description` and `argument-hint`.
- Include `$ARGUMENTS` and explain how to interpret user arguments.
- Name required tools, skills, `human_in_loop`, todos, memory, and subagents when relevant.
- Use `human_in_loop` for every user-facing clarification or approval question.
- Add docs in `docs/prompts.md`, `README.md`, and `docs/extensions/index.md` when exposed as a slash command.
- Add prompt validation tests for critical workflow language.
- Include validation commands and rollback/stop points for workflows that create code, issues, PRs, or plans.

## Skills

Use skills for reusable expert workflows loaded by the agent when the task matches.

Requirements:

- Store under `skills/<name>/SKILL.md`.
- Frontmatter must include `name: <directory-name>` and non-empty `description`.
- State scope, rules, required process, stop conditions, and output format.
- Reference related docs or prompts when applicable.
- Use `human_in_loop` for user-facing clarification and approval questions.
- Add docs in `docs/skills.md`.
- Add tests when the skill encodes safety, workflow, or validation policy.

## Extension commands

Use extension commands when runtime behavior is needed: UI interaction, event hooks, persistent state, custom rendering, or command-to-agent handoff.

Requirements:

- Store under `extensions/<name>/index.ts`.
- Register commands with clear descriptions.
- Keep command handlers small; queue agent workflows with `pi.sendUserMessage` when the work belongs in the agent loop.
- Avoid duplicate command names with prompt templates unless intentional.
- Document commands in `docs/extensions/<name>.md`, `docs/extensions/index.md`, and `README.md`.
- Add or update unit tests for registration and command behavior.

## Tools

Use tools for structured, bounded capabilities callable by the agent.

Requirements:

- Define a strict TypeBox parameter schema.
- Provide `description`, `promptSnippet`, and `promptGuidelines` when the tool should be agent-visible.
- Return concise `content` and structured `details` for rendering/state.
- Truncate large outputs and document where full output can be inspected.
- Protect files, credentials, network exposure, package installs, and destructive operations.
- Use `human_in_loop` before user-facing approvals or risky writes.
- Use file mutation queues or equivalent safeguards when a tool mutates files.
- Add unit tests for schema-relevant behavior, safety checks, truncation, and error paths.

## Custom subagents

Use custom subagents when a recurring specialist role is missing from the built-in catalog.

Requirements:

- First call `subagent action=list` before non-trivial delegation.
- Prefer an existing specialist whose description matches.
- Create a narrow custom specialist only when no matching specialist exists.
- Include description, tool limits, success criteria, escalation rules, and output contract.
- Keep the parent agent responsible for synthesis, verification, final decisions, and user-facing communication.
- Do not use subagents for simple tasks that can be handled directly.

## Security review

Every new resource must state security considerations. Check for:

- file writes, restores, deletes, and path traversal
- secret exposure in prompts, logs, archives, issues, PRs, and docs
- package installation or third-party code adoption
- network exposure beyond localhost
- shell command execution
- user approval requirements
- persistence under `~/.pi` or repository files

## Documentation and tests

Every resource change should include:

- user docs for commands/tools/skills
- MkDocs nav updates for new docs pages
- README updates for visible commands or extension entrypoints
- targeted unit tests for required workflow/safety text or helper behavior
- validation commands in docs, issues, PRs, or skill output

## Rollback and stop points

Before implementation, define how to stop or revert safely:

- prompts/skills: revert Markdown guidance if it causes bad workflows
- extension commands/tools: disable command/tool registration while preserving safe helpers
- custom subagents: delete obsolete generated agents or narrow their scope
- persistent state: document storage path and migration/cleanup path
- risky writes/restores: retain archive/list/status behavior and disable apply/restore flows if safety is insufficient
