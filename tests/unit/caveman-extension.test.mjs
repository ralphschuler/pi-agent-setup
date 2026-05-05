import assert from "node:assert/strict";
import test from "node:test";

import cavemanExtension from "../../extensions/caveman/index.ts";
import { readText } from "../helpers.mjs";

test("caveman extension registers command and prompt injection hook", () => {
  const source = readText("extensions/caveman/index.ts");

  assert.match(source, /pi\.registerCommand\("caveman"/);
  assert.match(source, /pi\.on\("before_agent_start"/);
  assert.match(source, /systemPrompt:\s*event\.systemPrompt \+ cachedInjection/);
});

test("caveman extension supports English-only command modes", () => {
  const extensionSource = readText("extensions/caveman/index.ts");
  const coreSource = readText("extensions/caveman/core.mjs");
  const source = `${extensionSource}\n${coreSource}`;

  for (const token of ["lite", "full", "ultra", "on", "off", "status"]) {
    assert.match(source, new RegExp(`\\b${token}\\b`), `missing command token ${token}`);
  }
  assert.doesNotMatch(source, /文言|組件|重繪/);
});

test("caveman prompt keeps safety and technical precision", () => {
  const source = readText("extensions/caveman/core.mjs");

  for (const phrase of [
    "Preserve technical accuracy",
    "Do not dumb down code",
    "irreversible action confirmation",
    "normal mode",
    "Do not drift verbose",
    "fewer output tokens",
    "Intensity",
  ]) {
    assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing prompt phrase: ${phrase}`);
  }
});

test("caveman command handles aliases, status, off, and invalid args", async () => {
  const events = new Map();
  const commands = new Map();
  const notifications = [];
  const statuses = [];
  const pi = {
    on(name, handler) {
      events.set(name, handler);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
  };
  const ui = {
    notify(message, level) {
      notifications.push({ message, level });
    },
    setStatus(name, value) {
      statuses.push({ name, value });
    },
  };

  cavemanExtension(pi);
  const command = commands.get("caveman");
  assert.ok(command);

  events.get("session_start")({}, { ui });
  assert.equal(statuses.at(-1).name, "caveman");
  assert.match(statuses.at(-1).value, /^🪨 caveman /);

  assert.deepEqual(command.getArgumentCompletions("ul"), [{ value: "ultra", label: "ultra" }]);
  assert.equal(command.getArgumentCompletions("missing"), null);

  await command.handler("ultra", { ui });
  assert.deepEqual(notifications.at(-1), { message: "caveman ON (ultra)", level: "info" });
  assert.deepEqual(statuses.at(-1), { name: "caveman", value: "🪨 caveman ultra •" });

  const promptUpdate = events.get("before_agent_start")({ systemPrompt: "base" });
  assert.match(promptUpdate.systemPrompt, /<caveman-mode active level="ultra">/);
  assert.match(promptUpdate.systemPrompt, /Use English only/);

  await command.handler("status", { ui });
  assert.deepEqual(notifications.at(-1), { message: "🪨 caveman ultra •", level: "info" });

  await command.handler("off", { ui });
  assert.deepEqual(notifications.at(-1), { message: "caveman OFF", level: "info" });
  assert.deepEqual(statuses.at(-1), { name: "caveman", value: "🪨 caveman off •" });
  assert.equal(events.get("before_agent_start")({ systemPrompt: "base" }), undefined);

  await command.handler("on", { ui });
  assert.deepEqual(notifications.at(-1), { message: "caveman ON (ultra)", level: "info" });
  assert.deepEqual(statuses.at(-1), { name: "caveman", value: "🪨 caveman ultra •" });

  await command.handler("bad", { ui });
  assert.equal(notifications.at(-1).level, "warning");
  assert.match(notifications.at(-1).message, /unknown arg "bad"/);
});

test("caveman state persists outside repository under pi agent data", () => {
  const source = readText("extensions/caveman/core.mjs");

  assert.match(source, /os\.homedir\(\)/);
  assert.match(source, /"\.pi", "agent", "caveman-local"/);
  assert.match(source, /STATE_PATH/);
  assert.doesNotMatch(source, /path\.join\(ctx\.cwd/);
});
