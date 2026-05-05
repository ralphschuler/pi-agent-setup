import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("to-issue workflow requires human-in-loop selectable issue review before creation", () => {
  const source = readText("extensions/github-handoff/index.ts");

  for (const phrase of [
    "human-in-loop selectable review list",
    "choose issues to create, confirm, or cancel",
    "Render a proposed issue list",
    "Do not create issues before this confirmation",
    "Human-in-loop selection confirmed or canceled",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});

test("to-pr workflow includes TUI-style progress and human confirmation", () => {
  const source = readText("extensions/github-handoff/index.ts");

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
  const source = readText("extensions/github-handoff/index.ts");

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
