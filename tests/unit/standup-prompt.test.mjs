import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";
import { listPromptTemplatePaths } from "../prompt-template-helpers.mjs";

test("standup prompt defines read-only repo and GitHub summary workflow", () => {
  const promptPath = "prompts/standup.md";
  const source = readText(promptPath);

  assert.ok(listPromptTemplatePaths().includes(promptPath), "standup prompt must be a prompt template");

  for (const phrase of [
    "$ARGUMENTS",
    "Use the `standup` skill",
    "human_in_loop",
    "git status --short --branch",
    "git log --oneline --decorate -n 10",
    "gh auth status",
    "gh issue list --state open --limit 50",
    "gh pr list --state open --limit 50",
    "Do not modify files, issues, PRs, labels, branches, or remote state",
    "Yesterday / Completed",
    "Today / In progress",
    "Blockers / Risks",
    "Upcoming / Next priorities",
    "Repo hygiene",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});

test("standup skill documents read-only GitHub standup workflow", () => {
  const source = readText("skills/standup/SKILL.md");

  for (const phrase of [
    "name: standup",
    "Stay read-only",
    "gh repo view --json nameWithOwner,url,defaultBranchRef",
    "gh issue list --state open --limit 50",
    "gh pr list --state merged --limit 20",
    "completed/recently merged or closed",
    "upcoming priorities ordered by dependency and actionability",
    "human_in_loop",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});
