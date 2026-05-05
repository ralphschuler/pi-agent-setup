import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("refine-codebase prompt defines architecture deepening workflow", () => {
  const prompt = readText("prompts/refine-codebase.md");

  assert.match(prompt, /^description: Find codebase architecture deepening opportunities$/m);
  assert.match(prompt, /^argument-hint: "\[scope \/ paths \/ domain area \/ focus\]"$/m);
  assert.match(prompt, /\$ARGUMENTS/);

  for (const term of ["Module", "Interface", "Implementation", "Depth", "Seam", "Adapter", "Leverage", "Locality"]) {
    assert.match(prompt, new RegExp(`\\*\\*${term}\\*\\*`), `missing ${term}`);
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
    assert.ok(prompt.includes(phrase), `missing ${phrase}`);
  }
});

test("refine-codebase docs mention slash command", () => {
  assert.match(readText("docs/prompts.md"), /\/refine-codebase/);
  assert.match(readText("docs/extensions/index.md"), /\/refine-codebase/);
  assert.match(readText("README.md"), /\/refine-codebase/);
});
