import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("caveman extension registers command and prompt injection hook", () => {
  const source = readText("extensions/caveman/index.ts");

  assert.match(source, /pi\.registerCommand\("caveman"/);
  assert.match(source, /pi\.on\("before_agent_start"/);
  assert.match(source, /systemPrompt:\s*event\.systemPrompt \+ cachedInjection/);
});

test("caveman extension supports all requested command modes", () => {
  const source = readText("extensions/caveman/index.ts");

  for (const token of ["lite", "full", "ultra", "on", "off", "status"]) {
    assert.match(source, new RegExp(`"${token}"`), `missing command token ${token}`);
  }
});

test("caveman prompt keeps safety and technical precision", () => {
  const source = readText("extensions/caveman/core.mjs");

  for (const phrase of [
    "Preserve technical accuracy",
    "Do not dumb down code",
    "irreversible action confirmation",
    "normal mode",
    "Intensity",
  ]) {
    assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing prompt phrase: ${phrase}`);
  }
});

test("caveman state persists outside repository under pi agent data", () => {
  const source = readText("extensions/caveman/core.mjs");

  assert.match(source, /os\.homedir\(\)/);
  assert.match(source, /"\.pi", "agent", "caveman-local"/);
  assert.match(source, /STATE_PATH/);
  assert.doesNotMatch(source, /path\.join\(ctx\.cwd/);
});
