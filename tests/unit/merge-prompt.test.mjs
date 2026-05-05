import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";
import { listPromptTemplatePaths } from "../prompt-template-helpers.mjs";

test("merge prompt defines safe rebase merge workflow", () => {
  const promptPath = "prompts/merge.md";
  const source = readText(promptPath);

  assert.ok(listPromptTemplatePaths().includes(promptPath), "merge prompt must be a prompt template");

  for (const phrase of [
    "$ARGUMENTS",
    "github-merge",
    "github_rebase_merge",
    "human_in_loop",
    "gh auth status",
    "gh pr view --json number,headRefName,mergeStateStatus,mergeable,statusCheckRollup,url,isDraft,state,title",
    "gh pr checks --watch",
    "gh pr merge --rebase",
    "Do not auto-create a PR",
    "Do not merge a draft PR",
    "Final merged state verified",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});
