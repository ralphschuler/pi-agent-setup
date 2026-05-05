import assert from "node:assert/strict";
import test from "node:test";

import autoCompact, { buildGistCompactionPrompt } from "../../extensions/auto-compact/index.ts";
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

test("auto-compact command toggles status and reports usage", async () => {
  const events = new Map();
  const commands = new Map();
  const statuses = [];
  const notices = [];
  autoCompact({
    on: (name, handler) => events.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
  });
  const ctx = {
    ui: { setStatus: (key, value) => statuses.push({ key, value }), notify: (message, level) => notices.push({ message, level }) },
  };

  await events.get("session_start")({}, ctx);
  await commands.get("auto-compact").handler("off", ctx);
  await commands.get("auto-compact").handler("on", ctx);
  await commands.get("auto-compact").handler("wat", ctx);

  assert.deepEqual(statuses.at(-2), { key: "auto-compact", value: undefined });
  assert.deepEqual(statuses.at(-1), { key: "auto-compact", value: "🧠 compact gist" });
  assert.match(notices.at(-1).message, /Usage/);
});

test("auto-compact hook falls back when configured model is unavailable", async () => {
  const events = new Map();
  const notices = [];
  autoCompact({
    on: (name, handler) => events.set(name, handler),
    registerCommand: () => {},
  });

  const result = await events.get("session_before_compact")(
    {
      preparation: {
        messagesToSummarize: [{ role: "user", content: [{ type: "text", text: "hello" }], timestamp: Date.now() }],
        turnPrefixMessages: [],
        previousSummary: "",
        fileOps: { read: new Set(["README.md"]), written: new Set(), edited: new Set() },
        tokensBefore: 123,
        firstKeptEntryId: "entry-1",
      },
      signal: new AbortController().signal,
    },
    { modelRegistry: { find: () => undefined }, ui: { notify: (message, level) => notices.push({ message, level }) } },
  );

  assert.equal(result, undefined);
  assert.match(notices.at(-1).message, /model not found/);
});

test("auto-compact extension registers command and compaction hook", () => {
  const source = readText("extensions/auto-compact/index.ts");

  assert.match(source, /pi\.registerCommand\("auto-compact"/);
  assert.match(source, /pi\.on\("session_before_compact"/);
  assert.match(source, /serializeConversation\(convertToLlm\(messages\)\)/);
  assert.match(source, /firstKeptEntryId/);
  assert.match(source, /tokensBefore/);
});
