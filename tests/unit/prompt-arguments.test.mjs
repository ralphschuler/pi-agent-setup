import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("prompt templates declare argument hints and consume arguments", () => {
  for (const prompt of ["bootstrap", "review", "research"]) {
    const content = readText(`prompts/${prompt}.md`);
    assert.match(content, /^---\n/, `${prompt} missing frontmatter`);
    assert.match(content, /^description:\s+\S/m, `${prompt} missing description`);
    assert.match(content, /^argument-hint:\s+["<\[]/m, `${prompt} missing argument hint`);
    assert.match(content, /\$ARGUMENTS/, `${prompt} does not consume command arguments`);
  }
});

test("prompt-arguments extension expands common markdown argument placeholders", () => {
  const source = readText("extensions/prompt-arguments/index.ts");

  assert.match(source, /pi\.registerCommand\(template\.name/);
  assert.match(source, /expandPromptTemplate\(template\.body, args\)/);
  assert.match(source, /\$ARGUMENTS/);
  assert.match(source, /\$@/);
  assert.ok(source.includes(".replace(/\\$(\\d+)/g"));
  assert.match(source, /User arguments:/);
  assert.match(source, /argument-hint/);
});
