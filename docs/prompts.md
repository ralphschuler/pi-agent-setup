# Prompts

Prompt templates in `prompts/` become slash commands. Workflow prompts should instruct the agent to use tools, skills, `human_in_loop`, and subagents directly instead of hiding the workflow behind extension command handlers. Use [`Resource rules`](resource-rules.md) when creating or changing prompt templates.

## Included prompts

### `debug.md`

A strategic evidence-first debugging prompt that guides reproduction, hypothesis ranking, localization, root-cause fix, regression coverage, validation, and reporting. Accepts a symptom, failing command, or bug report via `/debug <symptom / failing command / bug report>`.

### `standup.md`

A read-only repository standup workflow. Accepts optional scope, date, or focus via `/standup [scope / date / focus]`.

The workflow uses the `standup` skill to inspect git state, GitHub issues, and pull requests, then summarizes completed, in-progress, blocked, and upcoming work with repo hygiene notes and links.

### `to-issue.md`

A GitHub issue creation workflow. Accepts optional scope, title, or filter via `/to-issue [scope / title / filter]`.

The workflow inspects repo/auth state, reviews conversation and relevant files, checks existing issues and labels with `gh label list --limit 100`, drafts issue bodies with a required section template, proposes labels for each drafted issue, uses `human_in_loop` for issue selection/approval and post-selection missing-label creation, and creates confirmed issues with `gh issue create --label`.

Required issue body headings: Summary, Evidence/Context, Decisions, Tasks, Proposed Solution, Acceptance Criteria, Relevant Files/Commands, Validation, Risks/Rollback, and Source Conversation Context.

### `merge.md`

A safe GitHub rebase merge workflow. Accepts optional PR number, URL, or branch via `/merge [PR number / URL / branch]`.

The workflow identifies an existing open PR, waits for checks, uses `human_in_loop` for approval when needed, calls `github_rebase_merge`, and verifies final merged state. It never auto-creates a PR and stops on draft, failed checks, non-mergeable, missing PR, or ambiguous target state.

### `to-pr.md`

A GitHub pull request workflow. Accepts optional PR title or scope via `/to-pr [PR title / scope]`.

The workflow inspects repo state and diffs, records validation, uses `human_in_loop` before committing/creating a PR when approval is needed, pushes the branch, and creates a PR with `gh pr create`.

### `pick-issue.md`

A GitHub issue pickup workflow. Accepts optional priority/filter via `/pick-issue [priority / filter]`.

The workflow inspects open issues with `gh issue list`/`gh issue view`, selects the highest-priority actionable issue, uses `human_in_loop` for ambiguous selection or dirty-tree handling, creates an issue branch, pushes it, and opens a draft/WIP PR linked to the issue.

### `review.md`

A multiagent-style deep technical audit prompt for architecture, backend/API, frontend/UI, security, testing, DevOps, and code quality review. Accepts optional scope, files, PR URL, or focus areas via `/review [scope / files / PR URL / focus areas]`.

Expected output includes an executive summary, risk matrix, concrete findings, GitHub-issue-ready tasks, and recommended implementation order.

### `research.md`

A multiagent-style research prompt for source discovery, technical analysis, security/risk review, alternatives comparison, and implementation planning. Requires a topic/question via `/research <topic or question>`.

Expected output includes sourced findings, confidence levels, risk/tradeoff tables, GitHub-issue-ready tasks, and recommended implementation order.

### `refine-codebase.md`

An architecture refinement prompt based on deepening shallow modules into deeper modules. Accepts optional scope or paths via `/refine-codebase [scope / paths / domain area / focus]`.

Expected output is a numbered list of deepening opportunities using the vocabulary Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, and Locality. It asks which candidate to explore before proposing concrete interfaces.

## Usage examples

```text
/debug npm test is failing with a timeout
/to-issue turn the last review findings into issues
/to-pr create a PR for the current branch
/merge current branch PR
/standup weekly repo status
/pick-issue implement, test, push, wait for checks, merge
/review review my current diff
/research compare deployment options for this repo
/refine-codebase extensions/web-terminal
```
