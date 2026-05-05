import assert from "node:assert/strict";
import test from "node:test";

import { assertDocsMentionSlashCommand, parsePromptTemplate } from "../prompt-template-helpers.mjs";

test("refine-codebase prompt defines architecture deepening workflow", () => {
  const { content, frontmatter } = parsePromptTemplate("prompts/refine-codebase.md");

  assert.equal(frontmatter.description, "Find codebase architecture deepening opportunities");
  assert.equal(frontmatter["argument-hint"], "[scope / paths / domain area / focus]");

  for (const term of ["Module", "Interface", "Implementation", "Depth", "Seam", "Adapter", "Leverage", "Locality"]) {
    assert.match(content, new RegExp(`\\*\\*${term}\\*\\*`), `missing ${term}`);
  }

  for (const phrase of [
    "deletion test",
    "Do not propose final interfaces yet",
    "Read `CONTEXT.md` if present",
    "Read `docs/adr/` if present",
    "Which of these would you like to explore?",
    "Module/interface friction",
    "Current shallowness",
    "Proposed deeper module",
    "Seam/adapters",
  ]) {
    assert.ok(content.includes(phrase), `missing ${phrase}`);
  }
});

test("refine-codebase docs mention slash command", () => {
  assertDocsMentionSlashCommand("prompts/refine-codebase.md", ["docs/prompts.md", "docs/extensions/index.md", "README.md"]);
});
