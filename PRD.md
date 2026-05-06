# Product Requirements Document: Pi Agent Workflow Upgrade Phases

## Summary

Implement a new set of Pi agent workflow upgrades as small, independently reviewable and quickly testable phases. The work improves GitHub workflow commands, merge automation, subagent delegation, live output visibility, code evolution workflows, and rules for creating Pi resources.

The rollout must preserve existing safety behavior, avoid installing third-party packages, keep GitHub actions authentic via `gh`, and ensure each phase can be stopped or reverted independently.

## Decisions Resolved

- Workflow slash commands should be prompt templates, not extension-registered commands, when their purpose is to guide the agent through tool/skill usage.
- `/to-issue`, `/to-pr`, and `/pick-issue` should move to prompt templates and avoid duplicate extension command registration.
- `/merge` requires an existing open PR for the current branch.
- `/merge` must use GitHub rebase merge: `gh pr merge --rebase`.
- `/merge` must wait for all checks and show a custom live TUI/progress interface.
- `/to-issue` must create detailed, evidence-backed issues and add labels.
- `/to-issue` label handling must inspect existing labels, apply existing labels after confirmation, and use `human_in_loop` before creating missing labels.
- Subagent usage should be stronger: non-trivial workflows should inspect available subagents and auto-create narrow specialists when matching agents are absent.
- `evolve` should be a local, full-clone-style extension inspired by `@artale/pi-evolve`, while retaining safety approvals and path protections.
- A resource creation ruleset should live in `docs/resource-rules.md` and be exposed through a `pi-resource-design` skill.

## Assumptions

- “tub” means a TUI live widget or progress UI.
- The repository remains `ralphschuler/pi-agent-setup` unless the user explicitly changes context.
- Existing untracked `PRD.md` is intentionally preserved/updated and should not be discarded.
- GitHub branch protection and CI remain authoritative; the implementation must not bypass required checks.
- Existing repository validation scripts remain the primary quality gate.

## Non-Goals

- Do not implement this PRD as part of PRD creation.
- Do not install `@artale/pi-evolve` or any third-party Pi package.
- Do not bypass GitHub checks, branch protections, or required approvals.
- Do not auto-create PRs inside `/merge`; `/merge` only operates on an existing PR.
- Do not force subagents for trivial single-step work.
- Do not expose secrets, tokens, or private unrelated conversation content in issues, PRs, logs, or archives.

## Goals

- Make workflow commands agent-visible and tool-aware through prompt templates and skills.
- Add a safe but capable merge workflow with live check progress and rebase merging.
- Improve GitHub issue quality, labels, and traceability from conversation decisions/tasks.
- Increase effective subagent delegation and specialist creation for complex work.
- Show compact live output for shell/process/subagent work without overwhelming context.
- Add an evolve workflow for file variants, archives, comparison, restore/apply, and Darwin-style iterations with guardrails.
- Define durable standards for prompts, skills, extensions, tools, and custom agents.

## Functional Requirements

1. Workflow command prompts must explicitly instruct the agent to use appropriate tools, skills, `human_in_loop`, todos, memory, and subagents.
2. `/to-issue`, `/to-pr`, and `/pick-issue` must be prompt templates under `prompts/` and must not collide with duplicate extension commands.
3. `/to-issue` must draft fully detailed GitHub issues containing summary, evidence/context, decisions, tasks, proposed solution, acceptance criteria, relevant files/commands, validation, risks, and source conversation context.
4. `/to-issue` must inspect labels with `gh label list`, propose labels, apply existing labels, and ask before creating missing labels.
5. `/merge` must find the current branch PR, wait for checks, show live TUI/progress bars per check, and perform `gh pr merge --rebase` only when safe.
6. `/merge` must stop with clear guidance when no current-branch PR exists, checks fail, the PR is non-mergeable, repo state is ambiguous, or GitHub CLI is unavailable/unauthenticated.
7. Shell/process/subagent live output must be small, throttled, truncated, and safe for model context.
8. Subagent guidance must require `subagent action=list` for non-trivial work and create narrow custom specialists when no matching specialist exists.
9. `evolve` must support clone-style commands/tools for archive, status, list, restore, compare, mutate, and Darwin-style iterations while requiring approvals for writes/restores.
10. Resource rules must define when to create prompts, skills, extensions, tools, and custom agents and how to validate each.
11. Each shipped phase must update docs and tests before merge.

## Safety and Security Requirements

- Use `human_in_loop` for every user-facing clarification or approval question.
- Do not overwrite/discard local changes without explicit user approval.
- Do not fake GitHub issue, PR, check, or merge operations.
- Do not install third-party packages as part of this work.
- Evolve archive/restore must protect `.env`, credential files, private keys, large files, binaries, and protected paths.
- Live output must be capped and must avoid leaking secrets where practical.
- Subagents must not spawn their own subagents unless explicitly designed and approved.
- Parent agent remains responsible for final synthesis and decisions.

## Phased Plan

### Phase 1: Convert GitHub Workflow Commands to Prompt Templates

Goal: Make `/to-issue`, `/to-pr`, and `/pick-issue` agent-visible prompts that can instruct tool, skill, and subagent usage.

Expected files/areas:

- `prompts/to-issue.md`
- `prompts/to-pr.md`
- `prompts/pick-issue.md`
- `extensions/github-handoff/index.ts`
- `docs/prompts.md`
- `docs/extensions/github-handoff.md`
- `tests/unit/github-handoff-tui-workflows.test.mjs`
- `tests/unit/prompt-template-validation.test.mjs`

Acceptance criteria:

- [ ] `prompts/to-issue.md`, `prompts/to-pr.md`, and `prompts/pick-issue.md` exist with valid frontmatter and argument handling.
- [ ] Duplicate extension registration for `/to-issue`, `/to-pr`, and `/pick-issue` is removed or disabled.
- [ ] Prompt bodies explicitly instruct use of relevant tools, skills, `human_in_loop`, and subagents.
- [ ] Docs describe the commands as prompt templates.
- [ ] Tests validate required workflow language after migration.

Quick validation:

```bash
node --test tests/unit/prompt-template-validation.test.mjs
node --test tests/unit/github-handoff-tui-workflows.test.mjs
```

Rollback/stop point:

- Revert prompt migration and restore/keep the existing extension command pattern if prompt command behavior is not reliable.

### Phase 2: Detailed `/to-issue` Bodies and Labels

Goal: Ensure `/to-issue` creates complete, evidence-backed, labeled GitHub issues.

Expected files/areas:

- `prompts/to-issue.md`
- `docs/extensions/github-handoff.md`
- `docs/prompts.md`
- `tests/unit/github-handoff-tui-workflows.test.mjs`

Acceptance criteria:

- [ ] Workflow requires `gh label list` before issue creation.
- [ ] Workflow proposes labels for each drafted issue.
- [ ] Workflow applies existing labels to confirmed issues.
- [ ] Workflow uses `human_in_loop` before creating missing labels.
- [ ] Issue body template includes Summary, Evidence/Context, Decisions, Tasks, Proposed Solution, Acceptance Criteria, Relevant Files/Commands, Validation, Risks/Rollback, and Source Conversation Context.
- [ ] Workflow avoids duplicate issues and reports skipped/non-actionable items.

Quick validation:

```bash
node --test tests/unit/github-handoff-tui-workflows.test.mjs
```

Manual check:

```bash
gh label list --limit 100
```

Rollback/stop point:

- Disable missing-label creation while retaining detailed issue body drafting and existing-label application.

### Phase 3: Merge Skill, `/merge` Prompt, and Live Merge Tool

Goal: Add a merge workflow that rebase-merges the current branch PR only after all checks pass, with custom live TUI/progress display.

Expected files/areas:

- `prompts/merge.md`
- `skills/merge/SKILL.md`
- `extensions/merge/index.ts`
- `docs/prompts.md`
- `docs/extensions/merge.md`
- `docs/skills.md`
- `mkdocs.yml`
- `tests/unit/merge*.test.mjs`

Acceptance criteria:

- [ ] `/merge` prompt exists and instructs the agent to use the merge skill/tool.
- [ ] `merge` skill defines the required safety workflow.
- [ ] Merge tool identifies the PR for the current branch.
- [ ] Merge tool waits for all checks to complete.
- [ ] Merge tool renders live TUI/progress bars per running check.
- [ ] Merge tool uses `gh pr merge --rebase`.
- [ ] Merge stops on missing PR, failed checks, non-mergeable PR, ambiguous repo/branch, missing `gh`, or unauthenticated `gh`.
- [ ] Merge does not auto-create a PR.

Quick validation:

```bash
node --test tests/unit/merge*.test.mjs
node --test tests/unit/prompt-template-validation.test.mjs
```

Manual checks with a test PR:

```bash
gh pr view --json number,headRefName,mergeStateStatus,mergeable,statusCheckRollup
gh pr checks --watch
gh pr merge --rebase --dry-run 2>/dev/null || true
```

Rollback/stop point:

- Keep `/merge` prompt and skill documentation but disable the live merge tool if check rendering or merge execution is unreliable.

### Phase 4: Compact Live Output for Shell, Processes, and Subagents

Goal: Show small live output during long-running shell/process/subagent activity without overwhelming context.

Expected files/areas:

- `extensions/shared/pretty-render.ts`
- `extensions/subagents/index.ts`
- `extensions/processes/index.ts`
- `extensions/processes/domain.ts`
- `docs/extensions/pretty-output.md`
- `docs/extensions/subagents.md`
- `docs/extensions/processes.md`
- `tests/unit/pretty-output-extension.test.mjs`
- new/updated subagent streaming tests

Acceptance criteria:

- [ ] Partial tool updates render compact current output instead of only `_Working…_`.
- [ ] Subagent runs stream the last N stdout/stderr lines where possible.
- [ ] Live output is throttled/debounced and truncated.
- [ ] Final result remains available and complete enough for the agent.
- [ ] Process output continues to support `/ps`, `process output`, and logs.
- [ ] Docs explain live output limits and how to inspect full logs.

Quick validation:

```bash
node --test tests/unit/pretty-output-extension.test.mjs
node --test tests/unit/process-domain.test.mjs
node --test tests/unit/subagent*.test.mjs
```

Rollback/stop point:

- Revert to final-output-only rendering if streaming introduces instability, keeping any safe partial-render improvements that pass tests.

### Phase 5: Stronger Subagent Creation and Delegation Policy

Goal: Make non-trivial workflows delegate more often and auto-create narrow specialists when no suitable agent exists.

Expected files/areas:

- `extensions/subagent-orchestrator/index.ts`
- `extensions/subagents/index.ts`
- `skills/pi-subagents/SKILL.md`
- `prompts/*.md`
- `docs/extensions/subagent-orchestrator.md`
- `docs/extensions/subagents.md`
- `docs/skills.md`
- `tests/unit/testable-feature-phases.test.mjs`
- new/updated subagent guidance tests

Acceptance criteria:

- [ ] Guidance requires `subagent action=list` before non-trivial delegation.
- [ ] Guidance says to create a narrow custom specialist when no matching specialist exists.
- [ ] Dynamic subagent creation includes description, tool limits, success criteria, escalation rules, and output contract.
- [ ] Parent agent remains responsible for synthesis, verification, and user-facing decisions.
- [ ] Guidance avoids mandatory subagents for simple single-step tasks.

Quick validation:

```bash
node --test tests/unit/testable-feature-phases.test.mjs
node --test tests/unit/*subagent*.test.mjs
```

Rollback/stop point:

- Retain `action=list` guidance but remove auto-create-specialist guidance if it creates too much overhead.

### Phase 6: Full-Clone-Style Evolve Extension with Safety Gates

Goal: Add a local `evolve` extension inspired by `@artale/pi-evolve` without installing that package.

Expected files/areas:

- `extensions/evolve/index.ts`
- `docs/extensions/evolve.md`
- `docs/extensions/index.md`
- `mkdocs.yml`
- `package.json` Pi extension manifest if needed
- `tests/unit/evolve*.test.mjs`

Target commands/tools:

- `/evolve <file>`
- `/evolve status`
- `/evolve archive`
- `/evolve restore <id>`
- `/evolve compare <a> <b>`
- `/mutate <file> [goal]`
- `/darwin <file> [gens] [goal]`
- `evolve_archive`
- `evolve_status`
- `evolve_list`
- `evolve_restore`
- `evolve_compare`

Acceptance criteria:

- [ ] Extension archives variants under `~/.pi/evolve/archive.json` or a documented equivalent.
- [ ] Archive/status/list/restore/compare workflows work locally.
- [ ] `/mutate` and `/darwin` queue agent workflows for variant generation/evolution.
- [ ] Restore/apply writes require `human_in_loop` approval.
- [ ] Protected paths such as `.env`, credential files, private keys, large files, and binaries are denied or require explicit safe handling.
- [ ] No third-party evolve package is installed.
- [ ] Docs disclose storage, safety limits, and rollback behavior.

Quick validation:

```bash
node --test tests/unit/evolve*.test.mjs
npm run typecheck
```

Manual safety checks:

```bash
# should deny or require approval
/evolve restore <id-for-env-like-file>
/darwin path/to/file 1 "safe refactor"
```

Rollback/stop point:

- Keep archive/list/status functionality and disable restore, mutate, or Darwin flows if safety or cost controls are insufficient.

### Phase 7: Resource Creation Ruleset and Skill

Goal: Define when and how to create prompts, skills, extensions, tools, and subagents.

Expected files/areas:

- `docs/resource-rules.md`
- `skills/pi-resource-design/SKILL.md`
- `docs/skills.md`
- `docs/prompts.md`
- `docs/extensions/index.md`
- `mkdocs.yml`
- `tests/unit/package-structure.test.mjs`
- new/updated ruleset tests

Acceptance criteria:

- [ ] Rules define when to choose prompt template vs skill vs extension command vs tool vs custom subagent.
- [ ] Rules include frontmatter/metadata requirements.
- [ ] Rules require tests, docs, security considerations, validation commands, and rollback/stop points.
- [ ] `pi-resource-design` skill loads with valid frontmatter and references the ruleset.
- [ ] Docs nav exposes the ruleset.

Quick validation:

```bash
node --test tests/unit/package-structure.test.mjs
node --test tests/unit/prompt-template-validation.test.mjs
```

Rollback/stop point:

- Keep `docs/resource-rules.md` if the skill proves redundant or too broad.

### Phase 8: Final Documentation and CI Validation

Goal: Update docs and run validation for all shipped phases.

Expected files/areas:

- `README.md`
- `docs/prompts.md`
- `docs/extensions/`
- `docs/skills.md`
- `docs/validation-testing.md`
- `mkdocs.yml`
- `tests/unit/`
- `tests/integration/` where needed

Acceptance criteria:

- [ ] New commands, tools, skills, and extension behaviors are documented.
- [ ] Validation commands are documented.
- [ ] Unit tests cover new prompt/skill/extension behavior.
- [ ] CI passes for implementation PRs.
- [ ] Rollout and rollback notes are current.

Quick validation:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:ci
npm run docs:build
```

Rollback/stop point:

- Revert docs-only changes if they get ahead of implementation or misrepresent shipped behavior.

## Files and Areas

Potentially affected areas:

- `prompts/`
- `skills/`
- `extensions/github-handoff/`
- `extensions/merge/`
- `extensions/evolve/`
- `extensions/subagents/`
- `extensions/subagent-orchestrator/`
- `extensions/processes/`
- `extensions/shared/pretty-render.ts`
- `docs/`
- `tests/unit/`
- `tests/integration/`
- `README.md`
- `mkdocs.yml`
- `package.json`

## Validation Strategy

Each phase must run its targeted quick validation before broad validation. Broad validation should be run before merge when environment supports it.

Recommended broad validation:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:ci
npm run docs:build
```

Known local caveat:

- If `PRD.md` remains intentionally untracked or not formatted according to Prettier during intermediate planning, full `npm run check` may fail on `PRD.md`. Implementation PRs should either format tracked docs or clearly report preserved local-only blockers.

## Rollout Plan

- Implement one phase per issue/PR where practical.
- Prefer small, independently revertible commits.
- Start with prompt migration and issue-label workflow because these shape later GitHub work.
- Implement `/merge` after prompt migration so it follows the new prompt+skill+tool pattern.
- Add live output and subagent policy after core workflows are stable.
- Add `evolve` after safety patterns are documented and tested.
- Finish with docs/CI sweep.

## Rollback Plan

- Prompt migration can be reverted to extension command prompts.
- `/merge` tool can be disabled while keeping prompt+skill guidance.
- Live-output streaming can be reverted to final-output-only rendering.
- Auto-create subagent guidance can be relaxed to “consider creating.”
- `evolve` can be reduced to read-only archive/list/status if write/restore safety is insufficient.
- Resource rules skill can be removed while retaining docs.

## Risks and Mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| `/merge` merges unexpectedly | High | Require existing PR, wait for checks, stop on ambiguity, use `human_in_loop` where approval/clarification is needed. |
| GitHub labels create repo clutter | Medium | Use existing labels first; require approval before creating missing labels. |
| Prompt/extension command collisions | Medium | Remove/disable duplicate extension commands during prompt migration. |
| Live output overwhelms context | Medium | Throttle, truncate, cap lines, and keep full logs out-of-context. |
| Subagent auto-creation creates noise | Medium | Require narrow scope, success criteria, tool limits, and parent synthesis. |
| Evolve archive leaks secrets | High | Deny/protect sensitive paths and document archive storage. |
| Evolve restore overwrites files | High | Require approval and path guards; provide rollback guidance. |
| Darwin-style loops run too long/costly | Medium | Limit generations, require explicit user scope, expose stop points. |
| Ruleset becomes stale | Low | Add docs/tests and reference from skill/prompt guidance. |

## Open Questions

- What exact default generation limit should `/darwin` use?
- What file size limit should `evolve` enforce by default?
- Should `evolve` archives store full content, diffs, or both?
- Should `/merge` always ask for final human approval before `gh pr merge --rebase`, even after checks pass?
- What label taxonomy should `/to-issue` prefer when a repo has no labels?
- Should live output be enabled by default for all tools or only for selected tools/subagents?
- Should auto-created custom subagents be project-scoped by default, user-scoped by explicit request only?
