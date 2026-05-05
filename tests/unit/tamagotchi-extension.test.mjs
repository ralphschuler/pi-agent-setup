import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("tamagotchi widget uses RPC-compatible string lines", () => {
  const source = readText("extensions/tamagotchi/index.ts");

  assert.doesNotMatch(source, /@mariozechner\/pi-tui/, "RPC clients cannot render TUI-only component imports");
  assert.match(source, /setWidget\?\.\(WIDGET_KEY, renderWidgetLines\(\), \{ placement: "belowEditor" \}\)/);
  assert.match(source, /setWidget\?: \(key: string, widget: string\[\] \| undefined/);
  assert.match(source, /┌ \$\{art\} \$\{state\.name\}/);
  assert.match(source, /\$\{stage\}/);
  assert.match(source, /hunger \$\{bar\(pct, 12\)\}/);
  assert.match(source, /streak \$\{state\.streakDays\}d/);
  assert.match(source, /const lastMeal = singleLine\(state\.lastMeal, 44\)/);
  assert.doesNotMatch(source, /global pet • \/pet/);
  assert.match(source, /pi\.on\("agent_start"/);
  assert.doesNotMatch(source, /setWidget\?\.\(WIDGET_KEY, \(_tui, theme\)/, "component factories are ignored in RPC mode");
});

test("tamagotchi sanitizes text rendered into terminal widgets", () => {
  const source = readText("extensions/tamagotchi/index.ts");

  assert.match(source, /function singleLine\(text: string, max: number\)/);
  assert.match(source, /state\.name = singleLine\(name, 24\)/);
  assert.match(source, /state\.lastMeal = singleLine\(reason, 90\)/);
  assert.match(source, /singleLine\(value\.lastMeal, 90\)/);
});

test("tamagotchi has versioned state, safe writes, and game progression", () => {
  const source = readText("extensions/tamagotchi/index.ts");

  assert.match(source, /const STATE_VERSION = 1/);
  assert.match(source, /await writeFile\(tempPath/);
  assert.match(source, /await rename\(tempPath, STORE_PATH\)/);
  assert.match(source, /achievements: string\[\]/);
  assert.match(source, /streakDays: number/);
  assert.match(source, /function stageForState/);
  assert.match(source, /function classifyEditReward/);
  assert.match(source, /tests-added/);
  assert.match(source, /docs-updated/);
});

test("tamagotchi command exposes stats, achievements, and mood", () => {
  const source = readText("extensions/tamagotchi/index.ts");

  assert.match(source, /\[stats\|achievements\|mood\|reset\|name <name>\]/);
  assert.match(source, /if \(action === "achievements"\)/);
  assert.match(source, /if \(action === "mood"\)/);
  assert.match(source, /renderPlainStats/);
});
