import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";
import { assertDocsMentionSlashCommand, parsePromptTemplate } from "../prompt-template-helpers.mjs";

const docsPaths = ["docs/prompts.md", "docs/extensions/index.md", "README.md"];

test("debug prompt defines strategic evidence-first workflow", () => {
  const { content, frontmatter } = parsePromptTemplate("prompts/debug.md");

  assert.equal(frontmatter.description, "Start a strategic evidence-first debugging session");
  assert.equal(frontmatter["argument-hint"], "<symptom / failing command / bug report>");

  for (const phrase of [
    "Strategic Debugging Session",
    "systematic-debugging",
    "disciplined diagnosis loop",
    "Do not guess or patch before a trusted feedback loop exists",
    "Phase 1: Build the feedback loop",
    "Phase 2: Reproduce and minimize",
    "Phase 3: Hypothesize",
    "3-5 plausible root causes",
    "falsifiable prediction",
    "Phase 4: Instrument and localize",
    "[DEBUG-",
    "Phase 5: Fix and regression-test",
    "correct seam",
    "Phase 6: Validate",
    "Phase 7: Cleanup and post-mortem",
    "Feedback loop",
    "Root cause",
    "human_in_loop",
  ]) {
    assert.ok(content.includes(phrase), `missing ${phrase}`);
  }
});

test("systematic debugging skill requires diagnosis loop discipline", () => {
  const skill = readText("skills/systematic-debugging/SKILL.md");

  for (const phrase of [
    "Build the feedback loop",
    "fast, sharp, and deterministic",
    "3-5 plausible causes",
    "prediction: `If <X> is the cause",
    "Instrument and localize",
    "[DEBUG-",
    "performance regressions, measure first",
    "correct seam",
    "Cleanup and post-mortem",
    "Use `human_in_loop` for every user-facing clarification or approval question",
  ]) {
    assert.ok(skill.includes(phrase), `missing ${phrase}`);
  }
});

test("debug prompt is documented as slash command", () => {
  assertDocsMentionSlashCommand("prompts/debug.md", docsPaths);
});
