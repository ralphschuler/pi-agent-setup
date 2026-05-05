import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("tamagotchi widget uses RPC-compatible string lines", () => {
  const source = readText("extensions/tamagotchi/index.ts");

  assert.doesNotMatch(source, /@mariozechner\/pi-tui/, "RPC clients cannot render TUI-only component imports");
  assert.match(source, /setWidget\?\.\(WIDGET_KEY, renderWidgetLines\(\), \{ placement: "belowEditor" \}\)/);
  assert.match(source, /setWidget\?: \(key: string, widget: string\[\] \| undefined/);
  assert.doesNotMatch(source, /setWidget\?\.\(WIDGET_KEY, \(_tui, theme\)/, "component factories are ignored in RPC mode");
});

test("tamagotchi sanitizes text rendered into terminal widgets", () => {
  const source = readText("extensions/tamagotchi/index.ts");

  assert.match(source, /function singleLine\(text: string, max: number\)/);
  assert.match(source, /state\.name = singleLine\(name, 24\)/);
  assert.match(source, /state\.lastMeal = singleLine\(reason, 90\)/);
  assert.match(source, /singleLine\(value\.lastMeal, 90\)/);
});
