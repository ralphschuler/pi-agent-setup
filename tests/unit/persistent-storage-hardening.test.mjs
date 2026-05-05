import assert from "node:assert/strict";
import test from "node:test";

import { decodeStoredBlock, encodeStoredBlock, normalizeSingleLine } from "../../extensions/shared/markdown-store-codec.ts";
import { parseMarkdown as parseCron, renderMarkdown as renderCron } from "../../extensions/cronjobs/index.ts";
import { parseMarkdown as parseGraph, renderMarkdown as renderGraph } from "../../extensions/graph-memory/index.ts";
import { parseMarkdown as parseTodo, renderMarkdown as renderTodo, sanitizeTodoText } from "../../extensions/todo/index.ts";

test("shared markdown store codec encodes blocks with legacy fallback", () => {
  const value = "Do work\n## Job 999\n- name: injected\n### Task\nBad";
  assert.equal(decodeStoredBlock(encodeStoredBlock(value)), value);
  assert.equal(decodeStoredBlock(value), value);
});

test("shared markdown store codec normalizes single-line scalars", () => {
  assert.equal(normalizeSingleLine(" Real\n\tName\u0000 "), "Real Name");
  assert.equal(normalizeSingleLine("Real   name", { collapseWhitespace: true }), "Real name");
});

test("cronjob task bodies with markdown sentinels do not create extra jobs after render", () => {
  const markdown = renderCron([
    {
      id: 1,
      name: "safe",
      task: "Do work\n## Job 999\n- name: injected\n### Task\nBad",
      schedule: "every 1 day",
      kind: "every",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  const parsed = parseCron(markdown);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].task.includes("## Job 999"), true);
});

test("graph memory notes with markdown sentinels do not create extra nodes after render", () => {
  const markdown = renderGraph({
    nodes: [
      {
        id: "safe",
        title: "safe",
        type: "fact",
        notes: "Useful note\n## Node: injected\n### Notes\nBad\n## Links",
        tags: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    edges: [],
  });
  const parsed = parseGraph(markdown);

  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.nodes[0].notes.includes("## Node: injected"), true);
});

test("todo text is single-line sanitized before markdown persistence", () => {
  assert.equal(sanitizeTodoText("Real\n- [ ] #999 injected\titem"), "Real - [ ] #999 injected item");
  const parsed = parseTodo(renderTodo([{ id: 1, text: "Real\n- [ ] #999 injected", status: "pending" }]));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].text, "Real - [ ] #999 injected");
});
