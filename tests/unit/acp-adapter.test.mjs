import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PiAcpAdapter } from "../../bin/pi-acp.mjs";
import { readJson, readText, repoRoot } from "../helpers.mjs";

function fakePiScript(mode = "normal") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-acp-fake-"));
  const script = path.join(dir, "fake-pi.mjs");
  fs.writeFileSync(
    script,
    `#!/usr/bin/env node
import { StringDecoder } from "node:string_decoder";
let buffer = "";
let nextTool = 1;
const decoder = new StringDecoder("utf8");
function emit(value) { process.stdout.write(JSON.stringify(value) + "\\n"); }
const mode = ${JSON.stringify(mode)};
function handle(command) {
  if (command.type === "extension_ui_response") {
    emit({ type: "agent_end", messages: [] });
    return;
  }
  if (command.type === "prompt") {
    emit({ type: "response", id: command.id, command: "prompt", success: true });
    if (mode === "ui") {
      emit({ type: "extension_ui_request", id: "ui-1", method: "confirm", title: "Approve?", message: "confirm" });
      return;
    }
    if (mode === "slow") {
      setTimeout(() => emit({ type: "agent_end", messages: [] }), 100);
      return;
    }
    emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "hello from pi" } });
    emit({ type: "tool_execution_start", toolCallId: "tool-" + nextTool, toolName: "bash", args: { command: "pwd" } });
    emit({ type: "tool_execution_end", toolCallId: "tool-" + nextTool++, toolName: "bash", isError: false, result: { content: [{ type: "text", text: "ok" }] } });
    emit({ type: "agent_end", messages: [] });
    return;
  }
  if (command.type === "abort") {
    emit({ type: "response", id: command.id, command: "abort", success: true });
    return;
  }
  emit({ type: "response", id: command.id, command: command.type, success: true, data: {} });
}
process.stdin.on("data", (chunk) => {
  buffer += decoder.write(chunk);
  while (true) {
    const index = buffer.indexOf("\\n");
    if (index === -1) break;
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (line.trim()) handle(JSON.parse(line));
  }
});
`,
    "utf8",
  );
  fs.chmodSync(script, 0o755);
  return script;
}

test("ACP adapter initializes with conservative capabilities", async () => {
  const adapter = new PiAcpAdapter({ piCommand: process.execPath, piModeArgs: [], piArgs: [fakePiScript()] });
  const response = await adapter.handle({ jsonrpc: "2.0", id: "1", method: "initialize", params: { protocolVersion: 1 } });
  assert.equal(response.result.protocolVersion, 1);
  assert.equal(response.result.agentInfo.name, "pi-acp");
  assert.equal(response.result.agentCapabilities.loadSession, false);
  adapter.closeAll();
});

test("ACP adapter creates sessions, streams prompt updates, and returns stop reason", async () => {
  const notifications = [];
  const adapter = new PiAcpAdapter({
    piCommand: process.execPath,
    piModeArgs: [],
    piArgs: [fakePiScript()],
    write: (message) => notifications.push(message),
  });

  const created = await adapter.handle({
    jsonrpc: "2.0",
    id: "new",
    method: "session/new",
    params: { cwd: repoRoot, mcpServers: [] },
  });
  const sessionId = created.result.sessionId;
  assert.equal(typeof sessionId, "string");

  const prompted = await adapter.handle({
    jsonrpc: "2.0",
    id: "prompt",
    method: "session/prompt",
    params: { sessionId, prompt: [{ type: "text", text: "Say hi" }] },
  });

  assert.equal(prompted.result.stopReason, "end_turn");
  assert.ok(notifications.some((entry) => entry.params?.update?.sessionUpdate === "agent_message_chunk"));
  assert.ok(notifications.some((entry) => entry.params?.update?.sessionUpdate === "tool_call"));
  assert.ok(notifications.some((entry) => entry.params?.update?.sessionUpdate === "tool_call_update"));
  adapter.closeAll();
});

test("ACP adapter cancels blocking extension UI requests so prompts do not hang", async () => {
  const notifications = [];
  const adapter = new PiAcpAdapter({
    piCommand: process.execPath,
    piModeArgs: [],
    piArgs: [fakePiScript("ui")],
    write: (message) => notifications.push(message),
  });
  const created = await adapter.handle({ jsonrpc: "2.0", id: "new", method: "session/new", params: { cwd: repoRoot, mcpServers: [] } });
  const prompted = await adapter.handle({
    jsonrpc: "2.0",
    id: "prompt",
    method: "session/prompt",
    params: { sessionId: created.result.sessionId, prompt: [{ type: "text", text: "Needs approval" }] },
  });

  assert.equal(prompted.result.stopReason, "end_turn");
  assert.ok(notifications.some((entry) => entry.params?.update?.content?.text?.includes("blocked extension UI request")));
  adapter.closeAll();
});

test("ACP adapter fails closed when child pi cannot spawn", async () => {
  const notifications = [];
  const adapter = new PiAcpAdapter({ piCommand: "/definitely/missing/pi", write: (message) => notifications.push(message) });
  const created = await adapter.handle({ jsonrpc: "2.0", id: "new", method: "session/new", params: { cwd: repoRoot, mcpServers: [] } });
  await new Promise((resolve) => setTimeout(resolve, 25));
  const prompted = await adapter.handle({
    jsonrpc: "2.0",
    id: "prompt",
    method: "session/prompt",
    params: { sessionId: created.result.sessionId, prompt: [{ type: "text", text: "x" }] },
  });

  assert.equal(prompted.error.code, -32000);
  assert.match(prompted.error.message, /ENOENT|missing/);
  assert.ok(notifications.some((entry) => entry.params?.update?.content?.text?.includes("process unavailable")));
  adapter.closeAll();
});

test("ACP adapter rejects concurrent prompts for one session", async () => {
  const adapter = new PiAcpAdapter({ piCommand: process.execPath, piModeArgs: [], piArgs: [fakePiScript("slow")] });
  const created = await adapter.handle({ jsonrpc: "2.0", id: "new", method: "session/new", params: { cwd: repoRoot, mcpServers: [] } });
  const sessionId = created.result.sessionId;
  const first = adapter.handle({
    jsonrpc: "2.0",
    id: "first",
    method: "session/prompt",
    params: { sessionId, prompt: [{ type: "text", text: "one" }] },
  });
  const second = await adapter.handle({
    jsonrpc: "2.0",
    id: "second",
    method: "session/prompt",
    params: { sessionId, prompt: [{ type: "text", text: "two" }] },
  });

  assert.equal(second.error.code, -32000);
  assert.match(second.error.message, /already running/);
  assert.equal((await first).result.stopReason, "end_turn");
  adapter.closeAll();
});

test("ACP adapter fails closed for unsupported methods and unknown sessions", async () => {
  const adapter = new PiAcpAdapter({ piCommand: process.execPath, piModeArgs: [], piArgs: [fakePiScript()] });
  const unsupported = await adapter.handle({ jsonrpc: "2.0", id: "bad", method: "session/load", params: {} });
  assert.equal(unsupported.error.code, -32601);

  const missing = await adapter.handle({
    jsonrpc: "2.0",
    id: "prompt",
    method: "session/prompt",
    params: { sessionId: "missing", prompt: [{ type: "text", text: "x" }] },
  });
  assert.equal(missing.error.code, -32000);
  assert.match(missing.error.message, /Unknown ACP session/);
  adapter.closeAll();
});

test("package exposes pi-acp bin and docs", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.bin["pi-acp"], "./bin/pi-acp.mjs");
  assert.ok(readText("README.md").includes("pi-acp"));
  assert.ok(readText("mkdocs.yml").includes("acp-adapter.md"));
});
