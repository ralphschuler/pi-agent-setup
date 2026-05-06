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

test("pretty-output wraps built-in and extension tools with markdown result rendering", () => {
  const source = readText("extensions/pretty-output/index.ts");
  const shared = readText("extensions/shared/pretty-render.ts");

  for (const tool of ["bash", "read", "edit", "write", "grep", "find", "ls"]) {
    assert.match(source, new RegExp(`${tool}: create`), `missing ${tool} factory`);
  }
  assert.match(source, /pi\.registerTool = \(definition\) => registerTool\(withPrettyRenderer/);
  assert.match(source, /renderResult\(result/);
  assert.match(source, /formatPrettyToolMarkdown\(name, result, options, context\.args\)/);
  assert.match(shared, /getMarkdownTheme\(\)/);
  assert.match(shared, /createPrettyMarkdown\(markdown/);
  assert.match(shared, /function fenced\(text/);
});

test("pretty-output avoids markdown headings in tool cards", () => {
  const source = readText("extensions/shared/pretty-render.ts");

  assert.doesNotMatch(source, /`### /);
  assert.match(source, /`\*\*\$\{title\}\*\*/);
});

test("pretty-output passes MarkdownTheme to pi-tui Markdown", () => {
  const source = readText("extensions/shared/pretty-render.ts");

  assert.doesNotMatch(source, /new Markdown\([^)]*, 0, 0, theme\)/);
  assert.match(source, /new Markdown\(markdown, 0, 0, getMarkdownTheme\(\)\)/);
});

test("pretty-output renders partial tool output compactly when available", () => {
  const source = readText("extensions/shared/pretty-render.ts");

  assert.match(source, /partialToolMarkdown\(toolName, result, args\)/);
  assert.match(source, /textFromResult\(result\)\.trimEnd\(\)/);
  assert.match(source, /tailLines\(text, 8, 4000\)/);
  assert.match(source, /_Working…_/);
});
