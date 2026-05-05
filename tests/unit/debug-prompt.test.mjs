import assert from "node:assert/strict";
import test from "node:test";

import { assertDocsMentionSlashCommand, parsePromptTemplate } from "../prompt-template-helpers.mjs";

const docsPaths = ["docs/prompts.md", "docs/extensions/index.md", "README.md"];

test("debug prompt defines strategic evidence-first workflow", () => {
  const { content, frontmatter } = parsePromptTemplate("prompts/debug.md");

  assert.equal(frontmatter.description, "Start a strategic evidence-first debugging session");
  assert.equal(frontmatter["argument-hint"], "<symptom / failing command / bug report>");

  for (const phrase of [
    "Strategic Debugging Session",
    "evidence-first",
    "Do not guess or patch before collecting evidence",
    "Phase 1: Frame the symptom",
    "Phase 2: Reproduce",
    "Phase 3: Hypothesize",
    "Phase 4: Localize",
    "Phase 5: Fix",
    "Phase 6: Validate",
    "Root cause",
    "human_in_loop",
  ]) {
    assert.ok(content.includes(phrase), `missing ${phrase}`);
  }
});

test("debug prompt is documented as slash command", () => {
  assertDocsMentionSlashCommand("prompts/debug.md", docsPaths);
});
