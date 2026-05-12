import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("plan workflow enforces deep drilldown planning before approval", () => {
  const source = readText("extensions/plan/index.ts");

  for (const phrase of [
    "deep drilldown planning mode",
    "Ask questions one at a time",
    "include your recommended answer",
    "inspect first instead of asking the user",
    "Decision tree",
    "Risk sweep",
    "Coverage checklist before READY FOR REVIEW",
    "Do not modify files",
    "Apply the plan",
    "Change the plan",
    "Make PRD.md",
    "plan:start",
    "startPlanning(task",
    "Create or update PRD.md only",
    "Synthesize from the approved plan",
    "CONTEXT.md",
    "docs/adr/",
    "deep modules with small stable testable interfaces",
    "## Problem Statement",
    "## User Stories",
    "## Implementation Decisions",
    "Avoid volatile file paths",
    "## Testing Decisions",
    "Prefer external behavior over implementation details",
    "PRD-ready summary",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});
