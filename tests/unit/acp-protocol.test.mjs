import assert from "node:assert/strict";
import test from "node:test";

import {
  ACP_PROTOCOL_VERSION,
  contentBlocksToImages,
  contentBlocksToPrompt,
  jsonRpcError,
  isDialogUiRequest,
  jsonRpcResult,
  parseJsonLines,
  piEventToAcpNotifications,
} from "../../bin/pi-acp.mjs";
import { readText } from "../helpers.mjs";

test("ACP adapter defines JSON-RPC and protocol constants", () => {
  assert.equal(ACP_PROTOCOL_VERSION, 1);
  assert.deepEqual(jsonRpcResult("1", { ok: true }), { jsonrpc: "2.0", id: "1", result: { ok: true } });
  assert.deepEqual(jsonRpcError("1", -32601, "nope"), { jsonrpc: "2.0", id: "1", error: { code: -32601, message: "nope" } });
});

test("ACP adapter uses strict LF JSONL framing", () => {
  const parsed = parseJsonLines("", '{"a":1}\r\n{"b":');
  assert.deepEqual(parsed.lines, ['{"a":1}']);
  assert.equal(parsed.rest, '{"b":');
  const next = parseJsonLines(parsed.rest, "2}\n");
  assert.deepEqual(next.lines, ['{"b":2}']);
  assert.equal(next.rest, "");
});

test("ACP prompt content maps text, resources, and images to Pi RPC inputs", () => {
  const blocks = [
    { type: "text", text: "hello" },
    { type: "resource_link", uri: "file:///tmp/a.ts" },
    { type: "resource", resource: { text: "embedded" } },
    { type: "image", data: "abc", mimeType: "image/png" },
  ];

  assert.equal(contentBlocksToPrompt(blocks), "hello\n\nContext resource: file:///tmp/a.ts\n\nembedded");
  assert.deepEqual(contentBlocksToImages(blocks), [{ type: "image", data: "abc", mimeType: "image/png" }]);
});

test("ACP adapter classifies blocking extension UI requests", () => {
  assert.equal(isDialogUiRequest({ type: "extension_ui_request", method: "confirm" }), true);
  assert.equal(isDialogUiRequest({ type: "extension_ui_request", method: "notify" }), false);
});

test("Pi RPC streaming events map to ACP session updates", () => {
  const text = piEventToAcpNotifications("s1", {
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: "hi" },
  });
  assert.equal(text[0].method, "session/update");
  assert.equal(text[0].params.update.sessionUpdate, "agent_message_chunk");
  assert.equal(text[0].params.update.content.text, "hi");

  const tool = piEventToAcpNotifications("s1", {
    type: "tool_execution_start",
    toolCallId: "call-1",
    toolName: "bash",
    args: { command: "npm test" },
  });
  assert.equal(tool[0].params.update.sessionUpdate, "tool_call");
  assert.equal(tool[0].params.update.kind, "execute");
});

test("ACP docs capture contract, unsupported capabilities, and validation", () => {
  const docs = readText("docs/acp-adapter.md");
  for (const phrase of [
    "Agent Client Protocol",
    "Zed",
    "JSON-RPC 2.0",
    "LF-delimited JSON",
    "session/new",
    "session/prompt",
    "session/cancel",
    "unsupported",
    "fail closed",
    "pi --mode rpc",
  ]) {
    assert.ok(docs.includes(phrase), `ACP docs missing ${phrase}`);
  }
});
