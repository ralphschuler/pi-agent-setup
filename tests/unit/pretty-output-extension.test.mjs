import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("pretty-output registers rich assistant guidance and command", () => {
  const source = readText("extensions/pretty-output/index.ts");

  assert.match(source, /pi\.on\("before_agent_start"/);
  assert.match(source, /Rich output mode is enabled/);
  assert.match(source, /pi\.registerCommand\("pretty-output"/);
  assert.match(source, /pi\.registerMessageRenderer\(PRETTY_MESSAGE_TYPE/);
});

test("pretty-output wraps common built-in tools with markdown result rendering", () => {
  const source = readText("extensions/pretty-output/index.ts");

  for (const tool of ["bash", "read", "grep", "find", "ls"]) {
    assert.match(source, new RegExp(`${tool}: create`), `missing ${tool} factory`);
  }
  assert.match(source, /renderResult\(result/);
  assert.match(source, /formatToolMarkdown\(name, result, options, context\.args\)/);
  assert.match(source, /new Markdown\(markdown/);
  assert.match(source, /fenced\(text/);
});
