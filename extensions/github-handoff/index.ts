import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function githubHandoff(pi: ExtensionAPI) {
  pi.registerCommand("to-issue", {
    description: "Create GitHub issue(s); optional args become issue scope/title/filter",
    handler: async (args, ctx) => {
      const scope = args.trim();
      ctx.ui.notify("Queued GitHub issue creation workflow with human-in-loop review.", "info");
      pi.sendUserMessage(buildIssuePrompt(scope), { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("to-pr", {
    description: "Create a GitHub pull request; optional args become PR title/scope",
    handler: async (args, ctx) => {
      const scope = args.trim();
      ctx.ui.notify("Queued GitHub PR workflow with TUI-style progress checklist.", "info");
      pi.sendUserMessage(buildPrPrompt(scope), { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("pick-issue", {
    description: "Pick a GitHub issue; optional args become priority/filter",
    handler: async (args, ctx) => {
      const scope = args.trim();
      ctx.ui.notify("Queued GitHub issue pickup workflow with TUI-style progress checklist.", "info");
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
    "Before creating anything, present a human-in-loop selectable review list so the user can choose issues to create, confirm, or cancel.",
    "Show a compact TUI-style progress checklist in assistant output as each step completes.",
    "",
    "Required process:",
    "1. Inspect the current git repository, branch, remotes, and GitHub CLI auth status.",
    "2. Review the conversation context for review findings, approved plans, tasks, TODOs, and implementation notes.",
    "3. If needed, inspect relevant repo files before creating issues so each issue is grounded in evidence.",
    "4. Group related sub-points into one issue only when they must be solved together; otherwise split them.",
    "5. For each issue, prepare a concise title and body with: Summary, Evidence/Context, Proposed Solution, Acceptance Criteria, Relevant Files, and Source Conversation Context.",
    "6. Render a proposed issue list with numbers, titles, one-line summaries, and create/skip recommendation.",
    "7. Use human_in_loop select/input/editor to let the user choose which proposed issues to create, confirm all, or cancel. Do not create issues before this confirmation.",
    "8. Use the GitHub CLI (`gh issue create`) against the current repo only for confirmed issues. If `gh` is unavailable or unauthenticated, report exact setup steps and do not fake creation.",
    "9. After creation, report the created issue URLs and any items intentionally skipped as duplicates/non-actionable.",
    "",
    "TUI-style progress checklist:",
    "- [ ] Repo/auth inspected",
    "- [ ] Conversation and files reviewed",
    "- [ ] Proposed issues drafted",
    "- [ ] Human-in-loop selection confirmed or canceled",
    "- [ ] Confirmed issues created",
    "- [ ] Summary reported",
    "",
    "Safety rules:",
    "- Use human_in_loop for every user-facing clarification or approval question, including issue selection, creation confirmation, ambiguous target repo, or ambiguous issue scope.",
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
    "Show a compact TUI-style progress checklist throughout discovery, selection, dirty-tree handling, branch creation, PR creation, and summary.",
    "",
    "Required process:",
    "1. Inspect git status, current branch, remotes, default branch, and GitHub CLI auth status.",
    "2. Use `gh issue list`/`gh issue view` to inspect open issues in the current repo. Consider labels, severity/priority wording, blockers, recency, and dependencies.",
    "3. Select the highest-priority issue that is actionable now. If selection is ambiguous, use human_in_loop select to ask the user to choose among 2-5 candidates.",
    "4. Output the selected issue into the session, including title, URL, labels, body summary, acceptance criteria, and relevant files/commands.",
    "5. Ensure the working tree is clean before creating a branch. If dirty, stop and use human_in_loop to ask the user how to proceed.",
    "6. Create a branch named like `issue-<number>-<short-slug>` from the default branch or current base after confirming it is safe.",
    "7. Push the branch and create a draft/WIP PR with `gh pr create --draft` (or title prefixed with `WIP:` if draft PRs are unavailable).",
    "8. Link the PR to the issue using closing/linking text in the PR body, e.g. `Closes #<number>` or `Refs #<number>` depending on whether the PR is intended to close it.",
    "9. Report the issue URL, branch, PR URL, and recommended first implementation steps.",
    "10. Keep the TUI-style checklist updated in the final report with completed/skipped/blocked states.",
    "",
    "TUI-style progress checklist:",
    "- [ ] Repo/auth inspected",
    "- [ ] Open issues loaded and scored",
    "- [ ] Issue selected or human-in-loop choice confirmed",
    "- [ ] Dirty tree checked and resolved via human_in_loop when needed",
    "- [ ] Branch created and pushed",
    "- [ ] Draft/WIP PR created and linked",
    "- [ ] Issue context and next steps reported",
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
    "Show a clear TUI-style progress checklist for status inspection, diff review, validation, commit, push, PR creation, and result.",
    "Before committing or creating a PR from inferred changes, present a human-in-loop review list of planned PR actions so the user can confirm or cancel.",
    "",
    "Required process:",
    "1. Inspect git status, current branch, remotes, recent commits, and GitHub CLI auth status.",
    "2. Inspect the current diff and relevant conversation context to understand what changed and why.",
    "3. If changes are uncommitted, summarize them and use human_in_loop to ask for approval before committing unless the user already explicitly requested commit/push/PR creation.",
    "4. Ensure validation status is known. Run appropriate checks if they have not been run for the current changes, or clearly state why they were skipped.",
    "5. Render a planned PR action list: files/commits included, validation status, branch/base, PR title/body summary, risks, and create/skip recommendation.",
    "6. Use human_in_loop select/confirm to let the user confirm the planned PR action list or cancel before commit/PR creation when approval is needed.",
    "7. Choose or create a sensible branch name if not already on a feature branch.",
    "8. Commit changes with a clear message when needed, push the branch, and create a PR with `gh pr create`.",
    "9. PR body must include: Summary, Changes, Validation, Risks/Rollback, Related Issues (if any), and Conversation Context.",
    "10. After creation, report the PR URL, branch, commit(s), validation run, and any follow-up tasks.",
    "11. Keep the TUI-style checklist updated in the final report with completed/skipped/blocked states.",
    "",
    "TUI-style progress checklist:",
    "- [ ] Repo/auth inspected",
    "- [ ] Diff and conversation reviewed",
    "- [ ] Validation run or skip reason recorded",
    "- [ ] Planned PR action list confirmed via human_in_loop when needed",
    "- [ ] Branch ready",
    "- [ ] Commit created or existing commits selected",
    "- [ ] Branch pushed",
    "- [ ] PR created",
    "- [ ] Result reported",
    "",
    "Safety rules:",
    "- Do not create a PR from dirty or unvalidated changes without clearly reporting what is included.",
    "- Do not include secrets, private tokens, or unrelated conversation content in the PR body.",
    "- If `gh` is unavailable or unauthenticated, report exact setup steps and do not fake PR creation.",
    "- Use human_in_loop for every user-facing clarification or approval question, including ambiguous base branch, target repo, or desired PR scope.",
  ].join("\n");
}
