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

test("caveman constants expose levels, commands, completions, and default state", () => {
  assert.deepEqual(VALID_LEVELS, ["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra"]);
  assert.deepEqual(COMMAND_TOKENS, ["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra", "wenyan", "off", "on", "status"]);
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
  assert.equal(isLevel("wenyan"), true);
  assert.equal(isLevel("wenyan-full"), true);
  assert.equal(normalizeLevel("wenyan"), "wenyan-full");
  assert.equal(displayLevel("wenyan-full"), "wenyan");
  assert.equal(displayLevel("ultra"), "ultra");
  assert.equal(isLevel("bad"), false);
  assert.equal(isLevel(undefined), false);

  assert.deepEqual(normalizeState({ enabled: false, level: "lite" }), { enabled: false, level: "lite" });
  assert.deepEqual(normalizeState({ enabled: true, level: "wenyan" }), { enabled: true, level: "wenyan-full" });
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
  const result = writeState({ enabled: true, level: "lite" }, fs, path.dirname(statePath), statePath);

  assert.deepEqual(result, { ok: true });
  assert.equal(fs.readFileSync(statePath, "utf8"), '{\n  "enabled": true,\n  "level": "lite"\n}\n');

  const failingFs = {
    mkdirSync() {
      throw new Error("no cave");
    },
  };
  assert.deepEqual(writeState(DEFAULT_STATE, failingFs, dir, statePath), { ok: false, reason: "no cave" });
});

test("statusLine and buildCavemanPrompt cover every intensity", () => {
  assert.equal(statusLine({ enabled: true, level: "full" }), "🪨 caveman full •");
  assert.equal(statusLine({ enabled: true, level: "wenyan-full" }), "🪨 caveman wenyan •");
  assert.equal(statusLine({ enabled: false, level: "full" }), "🪨 caveman off •");

  for (const level of VALID_LEVELS) {
    const prompt = buildCavemanPrompt(level);
    assert.match(prompt, new RegExp(`<caveman-mode active level="${level}">`));
    assert.match(prompt, /Preserve technical accuracy/);
    assert.match(prompt, /use \/caveman off to disable future turns/);
    assert.match(prompt, /Do not drift verbose/);
    assert.doesNotMatch(prompt, /until user says "stop caveman"/);
    assert.match(prompt, new RegExp(`Intensity ${level}:`));
  }
});
