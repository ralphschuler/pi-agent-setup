import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";
import { listPromptTemplatePaths } from "../prompt-template-helpers.mjs";

function readPrompt(name) {
  const promptPath = `prompts/${name}.md`;
  assert.ok(listPromptTemplatePaths().includes(promptPath), `${promptPath} must be a prompt template`);
  return readText(promptPath);
}

test("to-issue workflow requires human-in-loop selectable issue review before creation", () => {
  const source = readPrompt("to-issue");

  for (const phrase of [
    "human-in-loop selectable review list",
    "choose issues to create, confirm, or cancel",
    "Render a proposed issue list",
    "Do not create issues before this confirmation",
    "Human-in-loop selection confirmed or canceled",
    "gh label list",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});

test("to-pr workflow includes TUI-style progress and human confirmation", () => {
  const source = readPrompt("to-pr");

  for (const phrase of [
    "TUI-style progress checklist for status inspection, diff review, validation, commit, push, PR creation, and result",
    "planned PR action list",
    "confirm the planned PR action list or cancel",
    "Validation run or skip reason recorded",
    "PR created",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});

test("pick-issue workflow includes TUI-style progress checklist", () => {
  const source = readPrompt("pick-issue");

  for (const phrase of [
    "TUI-style progress checklist throughout discovery, selection, dirty-tree handling, branch creation, PR creation, and summary",
    "Open issues loaded and scored",
    "Dirty tree checked and resolved via human_in_loop when needed",
    "Draft/WIP PR created and linked",
    "completed/skipped/blocked states",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});

test("github-handoff extension does not register duplicate prompt-template commands", () => {
  const source = readText("extensions/github-handoff/index.ts");

  assert.ok(source.includes("intentionally does not register duplicate slash commands"));
  assert.equal(source.includes('pi.registerCommand("to-issue"'), false);
  assert.equal(source.includes('pi.registerCommand("to-pr"'), false);
  assert.equal(source.includes('pi.registerCommand("pick-issue"'), false);
});
