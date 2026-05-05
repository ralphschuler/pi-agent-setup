import assert from "node:assert/strict";
import test from "node:test";

import { buildGistCompactionPrompt } from "../../extensions/auto-compact/index.ts";
import { readText } from "../helpers.mjs";

test("auto-compact prompt preserves gist, decisions, context, and file lists", () => {
  const prompt = buildGistCompactionPrompt({
    conversationText: "[User]: Build the thing\n[Assistant]: Done",
    previousSummary: "Prior decision: use MkDocs",
    customInstructions: "Focus on deploy decisions",
    readFiles: ["README.md"],
    modifiedFiles: ["extensions/auto-compact/index.ts"],
  });

  for (const phrase of [
    "automated conversation compactor",
    "## Goal",
    "## Key Decisions",
    "## Critical Context",
    "## Next Steps",
    "<read-files>",
    "README.md",
    "<modified-files>",
    "extensions/auto-compact/index.ts",
    "Prior decision: use MkDocs",
    "Focus on deploy decisions",
  ]) {
    assert.ok(prompt.includes(phrase), `missing ${phrase}`);
  }
});

test("auto-compact extension registers command and compaction hook", () => {
  const source = readText("extensions/auto-compact/index.ts");

  assert.match(source, /pi\.registerCommand\("auto-compact"/);
  assert.match(source, /pi\.on\("session_before_compact"/);
  assert.match(source, /serializeConversation\(convertToLlm\(messages\)\)/);
  assert.match(source, /firstKeptEntryId/);
  assert.match(source, /tokensBefore/);
});
