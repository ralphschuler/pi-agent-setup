import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildCavemanPrompt,
  COMMAND_TOKENS,
  COMPLETION_ITEMS,
  createPaths,
  DEFAULT_STATE,
  displayLevel,
  isLevel,
  normalizeLevel,
  normalizeState,
  readState,
  statusLine,
  VALID_LEVELS,
  writeState,
} from "../../extensions/caveman/core.mjs";
import { tempDir } from "../helpers.mjs";

const PROMPT_BUDGET = {
  maxChars: 900,
  maxWords: 140,
  maxLines: 18,
};

function promptStats(prompt) {
  return {
    chars: prompt.length,
    words: prompt.trim().split(/\s+/).length,
    lines: prompt.split("\n").length,
  };
}

test("caveman constants expose levels, commands, completions, and default state", () => {
  assert.deepEqual(VALID_LEVELS, ["lite", "full", "ultra"]);
  assert.deepEqual(COMMAND_TOKENS, ["lite", "full", "ultra", "off", "on", "status"]);
  assert.deepEqual(COMPLETION_ITEMS[0], { value: "lite", label: "lite" });
  assert.deepEqual(DEFAULT_STATE, { enabled: true, level: "full" });
});

test("caveman paths live under pi agent data", () => {
  assert.deepEqual(createPaths("/tmp/home"), {
    dataDir: path.join("/tmp/home", ".pi", "agent", "caveman-local"),
    statePath: path.join("/tmp/home", ".pi", "agent", "caveman-local", "state.json"),
  });
});

test("isLevel and normalizeState sanitize persisted input", () => {
  assert.equal(isLevel("lite"), true);
  assert.equal(isLevel("full"), true);
  assert.equal(isLevel("ultra"), true);
  assert.equal(isLevel("wenyan"), false);
  assert.equal(isLevel("wenyan-full"), false);
  assert.equal(normalizeLevel("wenyan"), undefined);
  assert.equal(displayLevel("wenyan-full"), "full");
  assert.equal(displayLevel("ultra"), "ultra");
  assert.equal(isLevel("bad"), false);
  assert.equal(isLevel(undefined), false);

  assert.deepEqual(normalizeState({ enabled: false, level: "lite" }), { enabled: false, level: "lite" });
  assert.deepEqual(normalizeState({ enabled: true, level: "wenyan" }), { enabled: true, level: "full" });
  assert.deepEqual(normalizeState({ enabled: true, level: "bad" }), { enabled: true, level: "full" });
  assert.deepEqual(normalizeState(null), { enabled: true, level: "full" });
});

test("readState loads valid JSON and falls back on missing or invalid state", () => {
  const dir = tempDir("caveman-core");
  const statePath = path.join(dir, "state.json");

  assert.deepEqual(readState(fs, statePath), DEFAULT_STATE);

  fs.writeFileSync(statePath, JSON.stringify({ enabled: false, level: "ultra" }), "utf8");
  assert.deepEqual(readState(fs, statePath), { enabled: false, level: "ultra" });

  fs.writeFileSync(statePath, "not json", "utf8");
  assert.deepEqual(readState(fs, statePath), DEFAULT_STATE);
});

test("writeState persists pretty JSON and reports filesystem errors", () => {
  const dir = tempDir("caveman-core-write");
  const statePath = path.join(dir, "nested", "state.json");
  const result = writeState({ enabled: true, level: "lite" }, undefined, path.dirname(statePath), statePath);

  assert.deepEqual(result, { ok: true });
  assert.equal(fs.readFileSync(statePath, "utf8"), '{\n  "enabled": true,\n  "level": "lite"\n}\n');
  assert.equal(fs.statSync(statePath).mode & 0o777, 0o600);

  const failingFs = {
    mkdirSync() {
      throw new Error("no cave");
    },
  };
  assert.deepEqual(writeState(DEFAULT_STATE, failingFs, dir, statePath), { ok: false, reason: "no cave" });
});

test("statusLine and buildCavemanPrompt cover every intensity", () => {
  assert.equal(statusLine({ enabled: true, level: "full" }), "🪨 caveman full •");
  assert.equal(statusLine({ enabled: true, level: "wenyan-full" }), "🪨 caveman full •");
  assert.equal(statusLine({ enabled: false, level: "full" }), "🪨 caveman off •");

  for (const level of VALID_LEVELS) {
    const prompt = buildCavemanPrompt(level);
    assert.match(prompt, new RegExp(`<caveman-mode active level="${level}">`));
    assert.match(prompt, /Preserve technical accuracy/);
    assert.match(prompt, /use \/caveman off to disable future turns/);
    assert.doesNotMatch(prompt, /until user says "stop caveman"/);
    assert.match(prompt, new RegExp(`Intensity ${level}:`));
    assert.match(prompt, /Use English only/);
    assert.doesNotMatch(prompt, /文言|之\/乃\/為\/其|組件|重繪/);
  }
});

test("caveman prompt stays compact enough to reduce token pressure", () => {
  for (const level of VALID_LEVELS) {
    const prompt = buildCavemanPrompt(level);
    const stats = promptStats(prompt);

    assert.ok(stats.chars <= PROMPT_BUDGET.maxChars, `${level} prompt chars ${stats.chars} > ${PROMPT_BUDGET.maxChars}`);
    assert.ok(stats.words <= PROMPT_BUDGET.maxWords, `${level} prompt words ${stats.words} > ${PROMPT_BUDGET.maxWords}`);
    assert.ok(stats.lines <= PROMPT_BUDGET.maxLines, `${level} prompt lines ${stats.lines} > ${PROMPT_BUDGET.maxLines}`);
  }
});

test("caveman prompt preserves required structure while compressing prose", () => {
  const prompt = buildCavemanPrompt("ultra");

  assert.match(prompt, /Keep required templates\/checklists/);
  assert.match(prompt, /compress prose/);
  assert.match(prompt, /one-line answers/);
  assert.match(prompt, /exact code\/paths\/errors/);
});
