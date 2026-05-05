import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdownAnsi } from "../../extensions/web-terminal/terminal-session.ts";

test("web terminal renders plain markdown chunks as ANSI terminal output", () => {
  const rendered = renderMarkdownAnsi("# Title\nSome **bold** and `code`\n```\nconst x = 1;\n```\n", { inFence: false });

  assert.match(rendered, /\x1b\[1m/);
  assert.match(rendered, /\x1b\[4m/);
  assert.match(rendered, /Title/);
  assert.doesNotMatch(rendered, /^# Title/m);
  assert.match(rendered, /bold\x1b\[0m/);
  assert.match(rendered, /code\x1b\[0m/);
  assert.match(rendered, /const x = 1;/);
});

test("web terminal does not transform existing terminal control sequences", () => {
  const raw = "\x1b[2J# Title";
  assert.equal(renderMarkdownAnsi(raw, { inFence: false }), raw);
});
