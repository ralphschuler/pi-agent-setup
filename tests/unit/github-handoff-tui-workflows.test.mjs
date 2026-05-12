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
    "choose issues to create, confirm, edit, split/merge, reorder dependencies, or cancel",
    "Render a proposed vertical-slice breakdown",
    "Do not create issues before this confirmation",
    "AFK/HITL and dependency review confirmed or canceled via human_in_loop",
    "gh label list --limit 100",
    "tracer-bullet vertical-slice issues",
    "Prefer many thin slices",
    "AFK",
    "HITL",
    "Publish blockers first",
    "Do not modify or close parent/source issues",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});

test("to-issue workflow defines detailed issue bodies and label handling", () => {
  const source = readPrompt("to-issue");

  for (const heading of [
    "## Parent",
    "## Summary",
    "## What to build",
    "## Slice Type",
    "## Blocked by",
    "## Evidence/Context",
    "## Decisions",
    "## Tasks",
    "## Proposed Solution",
    "## Acceptance Criteria",
    "## Relevant Files/Commands",
    "## Validation",
    "## Risks/Rollback",
    "## Source Conversation Context",
  ]) {
    assert.ok(source.includes(heading), `missing ${heading}`);
  }

  for (const phrase of [
    "propose labels from the existing repo labels",
    "existing labels to apply",
    "missing labels that would need creation",
    "labels skipped because they are unnecessary or ambiguous",
    "Do not create issues before this confirmation; do not create labels before this confirmation either",
    "After issue selection is confirmed, use `human_in_loop` before creating any missing label needed by a confirmed issue",
    "gh label create",
    "proposed labels",
    "gh issue create --title ... --body-file ... --label ...",
    "in dependency order",
    "skipped as duplicates/non-actionable",
    "skipped label decisions",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});

test("to-issue workflow creates missing labels only after issue selection", () => {
  const source = readPrompt("to-issue");
  const selectionIndex = source.indexOf(
    "Do not create issues before this confirmation; do not create labels before this confirmation either",
  );
  const labelCreationIndex = source.indexOf(
    "After issue selection is confirmed, use `human_in_loop` before creating any missing label needed by a confirmed issue",
  );

  assert.notEqual(selectionIndex, -1, "missing pre-confirmation no-create guard");
  assert.notEqual(labelCreationIndex, -1, "missing post-selection label creation guard");
  assert.ok(labelCreationIndex > selectionIndex, "missing label creation must happen after issue selection");
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
    "TUI-style progress checklist throughout discovery, selection, dirty-tree handling, default-branch sync, branch creation, PR creation, and summary",
    "Open issues loaded and scored",
    "Dirty tree checked and resolved via human_in_loop when needed",
    "Default branch updated from remote",
    "Empty starter commit created and branch pushed",
    'git commit --allow-empty -m "chore: start issue #<number>"',
    "Draft/WIP PR created and linked",
    "completed/skipped/blocked states",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});

test("pick-issue workflow syncs latest default branch before issue branch creation", () => {
  const source = readPrompt("pick-issue");

  for (const phrase of [
    "Before creating the issue branch, switch to the default branch and update it from the remote with `git pull --ff-only origin <default-branch>`",
    "Use `git fetch origin <default-branch>` first",
    "Stop if the default branch cannot fast-forward cleanly",
    "if checkout would overwrite local changes",
    "if the remote/default branch is ambiguous",
    "Do not create issue branches from a stale default branch or unrelated feature branch",
    "Create the issue branch from the freshly updated default branch",
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
