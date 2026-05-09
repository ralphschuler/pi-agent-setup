import assert from "node:assert/strict";
import test from "node:test";

import prettyOutput from "../../extensions/pretty-output/index.ts";
import { renderPrettyToolResult } from "../../extensions/shared/pretty-render.ts";
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

test("pretty-output exposes a shared structured tool display contract", () => {
  const shared = readText("extensions/shared/pretty-render.ts");
  const processes = readText("extensions/processes/index.ts");
  const subagents = readText("extensions/subagents/renderer.ts");

  assert.match(shared, /export type ToolDisplayContract/);
  assert.match(shared, /export function renderToolDisplayContract/);
  assert.match(shared, /export function formatToolDisplayContract/);
  assert.match(shared, /sections\?: ToolDisplaySection\[\]/);
  assert.match(processes, /renderToolDisplayContract\(processDisplayContract/);
  assert.match(subagents, /renderToolDisplayContract\(subagentDisplayContract/);
});

test("pretty-output docs specify toggle semantics and rendered tools", () => {
  const docs = readText("docs/extensions/pretty-output.md");

  assert.match(docs, /`\/pretty-output off` disables assistant guidance and pretty tool renderers/);
  for (const tool of ["bash", "read", "edit", "write", "grep", "find", "ls"]) {
    assert.ok(docs.includes(`- \`${tool}\``), `missing documented tool: ${tool}`);
  }
});

test("pretty-output command toggles assistant prompt injection", async () => {
  const harness = installPrettyOutput();
  const { events, commands, statuses, notifications, ui } = harness;
  const command = commands.get("pretty-output");
  assert.ok(command);

  await events.get("session_start")({}, { ui });
  assert.deepEqual(statuses.at(-1), { name: "pretty-output", value: "pretty output: on" });

  const enabledPrompt = await events.get("before_agent_start")({ systemPrompt: "base" });
  assert.match(enabledPrompt.systemPrompt, /<pretty-output>/);
  assert.match(enabledPrompt.systemPrompt, /Rich output mode is enabled/);

  await command.handler("off", { ui });
  assert.deepEqual(statuses.at(-1), { name: "pretty-output", value: undefined });
  assert.deepEqual(notifications.at(-1), { message: "pretty-output: off", level: "info" });
  assert.equal(await events.get("before_agent_start")({ systemPrompt: "base" }), undefined);

  await command.handler("on", { ui });
  assert.deepEqual(statuses.at(-1), { name: "pretty-output", value: "pretty output: on" });
  assert.deepEqual(notifications.at(-1), { message: "pretty-output: on", level: "info" });
  const restoredPrompt = await events.get("before_agent_start")({ systemPrompt: "base" });
  assert.match(restoredPrompt.systemPrompt, /<pretty-output>/);
});

test("pretty-output preview reports current enabled state", async () => {
  const { commands, messages, ui } = installPrettyOutput();
  const command = commands.get("pretty-output");

  await command.handler("off", { ui });
  await command.handler("preview", { ui });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].customType, "pretty-output");
  assert.equal(messages[0].display, true);
  assert.equal(messages[0].details.enabled, false);
  assert.match(messages[0].content, /Pretty output preview/);
});

test("pretty-output off disables registered fallback tool renderers", async () => {
  const { commands, tools, ui } = installPrettyOutput();
  const customTool = tools.get("custom-tool");
  assert.ok(customTool.renderResult);

  const rendered = customTool.renderResult(textResult("hello"), {}, undefined, { args: { name: "demo" } });
  assert.ok(rendered);

  await commands.get("pretty-output").handler("off", { ui });
  assert.equal(customTool.renderResult(textResult("hello"), {}, undefined, { args: { name: "demo" } }), undefined);

  await commands.get("pretty-output").handler("on", { ui });
  assert.ok(customTool.renderResult(textResult("hello"), {}, undefined, { args: { name: "demo" } }));
});

test("pretty-output off disables built-in tool markdown renderers", async () => {
  const { commands, tools, ui } = installPrettyOutput();
  const bashTool = tools.get("bash");
  assert.ok(bashTool.renderResult);
  assert.ok(bashTool.renderResult(textResult("hello"), {}, undefined, { args: { command: "echo hello" } }));

  await commands.get("pretty-output").handler("off", { ui });

  assert.equal(bashTool.renderResult(textResult("hello"), {}, undefined, { args: { command: "echo hello" } }), undefined);
});

test("pretty-output off disables shared pretty tool renderers", async () => {
  const { commands, ui } = installPrettyOutput();
  const renderer = renderPrettyToolResult("graph_memory");
  assert.ok(renderer(textResult("remembered"), {}, undefined, { args: { action: "list" } }));

  await commands.get("pretty-output").handler("off", { ui });

  assert.equal(renderer(textResult("remembered"), {}, undefined, { args: { action: "list" } }), undefined);
});

function installPrettyOutput() {
  const events = new Map();
  const commands = new Map();
  const tools = new Map();
  const messages = [];
  const statuses = [];
  const notifications = [];
  const ui = {
    setStatus(name, value) {
      statuses.push({ name, value });
    },
    notify(message, level) {
      notifications.push({ message, level });
    },
  };
  const pi = {
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    registerMessageRenderer() {},
    sendMessage(message) {
      messages.push(message);
    },
    on(name, handler) {
      events.set(name, handler);
    },
  };

  prettyOutput(pi);
  pi.registerTool({ name: "custom-tool", description: "custom", inputSchema: {}, execute: async () => textResult("custom") });

  return { events, commands, tools, messages, statuses, notifications, ui };
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}
