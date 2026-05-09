import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("process list TUI renders fresh process state instead of width-only cache", () => {
  const source = readText("extensions/processes/index.ts");

  assert.doesNotMatch(source, /cachedLines/);
  assert.doesNotMatch(source, /cachedWidth/);
});

test("web terminal resize is debounced and duplicate server notices are suppressed", () => {
  const client = readText("extensions/web-terminal/public/app.js");
  const server = readText("extensions/web-terminal/terminal-session.ts");

  assert.match(client, /let resizeTimer/);
  assert.match(client, /clearTimeout\(resizeTimer\)/);
  assert.match(client, /setTimeout\(\(\) => \{/);
  assert.match(server, /let lastResizeNotice = ""/);
  assert.match(server, /if \(size !== lastResizeNotice\)/);
});
