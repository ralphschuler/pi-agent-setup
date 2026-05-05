import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";
import { listPromptTemplatePaths } from "../prompt-template-helpers.mjs";

const enforcedPromptPaths = ["prompts/research.md", "prompts/review.md", "prompts/refine-codebase.md"];
const enforcedSkillPaths = [
  "skills/code-review/SKILL.md",
  "skills/pi-processes/SKILL.md",
  "skills/pi-subagents/SKILL.md",
  "skills/project-bootstrap/SKILL.md",
  "skills/systematic-debugging/SKILL.md",
];

test("human_in_loop tool guidance requires tool use for user-facing questions", () => {
  const source = readText("extensions/human-in-loop/index.ts");

  assert.ok(source.includes("Use human_in_loop for every user-facing clarification or approval question"));
  assert.ok(source.includes("do not ask those questions in plain assistant text"));
  assert.ok(source.includes("Include a recommended answer or concise options"));
});

test("plan and GitHub handoff workflows require human_in_loop for clarification and approval", () => {
  const planSource = readText("extensions/plan/index.ts");
  const githubHandoffSource = readText("extensions/github-handoff/index.ts");

  assert.ok(planSource.includes("Ask every user-facing clarification or approval question with the human_in_loop tool"));
  assert.ok(planSource.includes("ask exactly one targeted question with human_in_loop and a recommended answer"));
  assert.ok(githubHandoffSource.includes("use human_in_loop select to ask the user to choose among 2-5 candidates"));
  assert.ok(githubHandoffSource.includes("use human_in_loop to ask the user how to proceed"));
  assert.ok(githubHandoffSource.includes("use human_in_loop to ask for approval before committing"));
});

test("core prompt templates require human_in_loop for user-facing questions", () => {
  for (const promptPath of enforcedPromptPaths) {
    const text = readText(promptPath);
    assert.ok(listPromptTemplatePaths().includes(promptPath), `${promptPath} must be a prompt template`);
    assert.ok(text.includes("human_in_loop"), `${promptPath} must mention human_in_loop`);
    assert.match(text, /Do not ask .*questions in plain assistant text/i, `${promptPath} must prohibit plain-text questions`);
  }
});

test("skills require human_in_loop for user-facing questions", () => {
  for (const skillPath of enforcedSkillPaths) {
    const text = readText(skillPath);
    assert.ok(text.includes("Use `human_in_loop` for every user-facing clarification or approval question"), skillPath);
    assert.ok(text.includes("Do not ask those questions in plain assistant text"), skillPath);
  }
});
