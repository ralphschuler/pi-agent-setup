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
    "Treat invoking `/merge` as approval",
    "Do not ask an extra confirmation before merging on the normal unambiguous safe path",
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

  assert.doesNotMatch(source, /Use `human_in_loop` confirm before merging unless/i);
  assert.doesNotMatch(source, /user-declined approval/i);
});

test("merge docs and skill document no-extra-confirmation safe path", () => {
  const skill = readText("skills/github-merge/SKILL.md");
  const docs = readText("docs/extensions/github-merge.md");
  const promptDocs = readText("docs/prompts.md");
  const extension = readText("extensions/github-merge/index.ts");

  for (const source of [skill, docs, promptDocs, extension]) {
    assert.match(source, /invocation (is|as|approves)|invoking .* is approval/i);
    assert.match(source, /normal unambiguous safe path|unambiguous safe PR/i);
  }
});
