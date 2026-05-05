import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function githubHandoff(pi: ExtensionAPI) {
  pi.registerCommand("to-issue", {
    description: "Create GitHub issue(s); optional args become issue scope/title/filter",
    handler: async (args, ctx) => {
      const scope = args.trim();
      ctx.ui.notify("Queued GitHub issue creation workflow.", "info");
      pi.sendUserMessage(buildIssuePrompt(scope), { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("to-pr", {
    description: "Create a GitHub pull request; optional args become PR title/scope",
    handler: async (args, ctx) => {
      const scope = args.trim();
      ctx.ui.notify("Queued GitHub PR creation workflow.", "info");
      pi.sendUserMessage(buildPrPrompt(scope), { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("pick-issue", {
    description: "Pick a GitHub issue; optional args become priority/filter",
    handler: async (args, ctx) => {
      const scope = args.trim();
      ctx.ui.notify("Queued GitHub issue pickup workflow.", "info");
      pi.sendUserMessage(buildPickIssuePrompt(scope), { deliverAs: "followUp" });
    },
  });
}

function buildIssuePrompt(scope: string) {
  return [
    "Run the /to-issue workflow for the current repository and conversation.",
    scope ? `User-provided scope/title/filter: ${scope}` : "No extra scope was provided; infer actionable issues from the conversation.",
    "",
    "Goal:",
    "Create GitHub issue(s) for actionable work identified in the current conversation and repo context.",
    "If the conversation contains multiple independent findings/tasks, especially after /review, create one issue per actionable item.",
    "Do not create duplicate issues for the same task.",
    "",
    "Required process:",
    "1. Inspect the current git repository, branch, remotes, and GitHub CLI auth status.",
    "2. Review the conversation context for review findings, approved plans, tasks, TODOs, and implementation notes.",
    "3. If needed, inspect relevant repo files before creating issues so each issue is grounded in evidence.",
    "4. Group related sub-points into one issue only when they must be solved together; otherwise split them.",
    "5. For each issue, prepare a concise title and body with: Summary, Evidence/Context, Proposed Solution, Acceptance Criteria, Relevant Files, and Source Conversation Context.",
    "6. Use the GitHub CLI (`gh issue create`) against the current repo. If `gh` is unavailable or unauthenticated, report exact setup steps and do not fake creation.",
    "7. After creation, report the created issue URLs and any items intentionally skipped as duplicates/non-actionable.",
    "",
    "Safety rules:",
    "- Ask for clarification before creating issues if the target repo or issue scope is ambiguous.",
    "- Do not include secrets, private tokens, or unrelated conversation content in issue bodies.",
    "- Do not modify files unless needed for temporary issue body drafts; clean up temporary files afterward.",
  ].join("\n");
}

function buildPickIssuePrompt(scope: string) {
  return [
    "Run the /pick-issue workflow for the current repository.",
    scope
      ? `User-provided priority/filter: ${scope}`
      : "No extra filter was provided; pick the next most important open issue from the repo.",
    "",
    "Goal:",
    "Select the next most important actionable GitHub issue, create a dedicated working branch, create a WIP/draft PR linked to the issue, and bring the full issue context into this session so implementation can begin.",
    "",
    "Required process:",
    "1. Inspect git status, current branch, remotes, default branch, and GitHub CLI auth status.",
    "2. Use `gh issue list`/`gh issue view` to inspect open issues in the current repo. Consider labels, severity/priority wording, blockers, recency, and dependencies.",
    "3. Select the highest-priority issue that is actionable now. If selection is ambiguous, ask the user to choose among 2-5 candidates.",
    "4. Output the selected issue into the session, including title, URL, labels, body summary, acceptance criteria, and relevant files/commands.",
    "5. Ensure the working tree is clean before creating a branch. If dirty, stop and ask the user how to proceed.",
    "6. Create a branch named like `issue-<number>-<short-slug>` from the default branch or current base after confirming it is safe.",
    "7. Push the branch and create a draft/WIP PR with `gh pr create --draft` (or title prefixed with `WIP:` if draft PRs are unavailable).",
    "8. Link the PR to the issue using closing/linking text in the PR body, e.g. `Closes #<number>` or `Refs #<number>` depending on whether the PR is intended to close it.",
    "9. Report the issue URL, branch, PR URL, and recommended first implementation steps.",
    "",
    "Safety rules:",
    "- Do not overwrite or discard local changes.",
    "- Do not pick issues from another repository unless the user explicitly asks.",
    "- Do not fake issue or PR creation if `gh` is unavailable or unauthenticated; report exact setup steps.",
    "- Do not start implementation after creating the WIP PR unless the user asks.",
  ].join("\n");
}

function buildPrPrompt(scope: string) {
  return [
    "Run the /to-pr workflow for the current repository and conversation.",
    scope
      ? `User-provided PR title/scope: ${scope}`
      : "No extra scope was provided; infer the PR title/body from current changes and conversation.",
    "",
    "Goal:",
    "Create a GitHub pull request for the current repository changes using the conversation as context.",
    "",
    "Required process:",
    "1. Inspect git status, current branch, remotes, recent commits, and GitHub CLI auth status.",
    "2. Inspect the current diff and relevant conversation context to understand what changed and why.",
    "3. If changes are uncommitted, summarize them and ask for approval before committing unless the user already explicitly requested commit/push/PR creation.",
    "4. Ensure validation status is known. Run appropriate checks if they have not been run for the current changes, or clearly state why they were skipped.",
    "5. Choose or create a sensible branch name if not already on a feature branch.",
    "6. Commit changes with a clear message when needed, push the branch, and create a PR with `gh pr create`.",
    "7. PR body must include: Summary, Changes, Validation, Risks/Rollback, Related Issues (if any), and Conversation Context.",
    "8. After creation, report the PR URL, branch, commit(s), validation run, and any follow-up tasks.",
    "",
    "Safety rules:",
    "- Do not create a PR from dirty or unvalidated changes without clearly reporting what is included.",
    "- Do not include secrets, private tokens, or unrelated conversation content in the PR body.",
    "- If `gh` is unavailable or unauthenticated, report exact setup steps and do not fake PR creation.",
    "- Ask for clarification if the base branch, target repo, or desired PR scope is ambiguous.",
  ].join("\n");
}
