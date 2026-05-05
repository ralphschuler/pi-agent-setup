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
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});
