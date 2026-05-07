import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { PiAcpAdapter } from "../../lib/acp/adapter.mjs";
import { contentBlocksToPrompt } from "../../lib/acp/content.mjs";
import { createLineReader, parseJsonLines } from "../../lib/acp/jsonl.mjs";
import { PiRpcSession } from "../../lib/acp/pi-rpc-session.mjs";
import { piEventToAcpNotifications } from "../../lib/acp/protocol.mjs";

test("ACP internal modules expose protocol, content, transport, backend, and adapter seams", async () => {
  assert.equal(contentBlocksToPrompt([{ type: "text", text: "hello" }]), "hello");
  assert.deepEqual(parseJsonLines("", '{"a":1}\n').lines, ['{"a":1}']);
  assert.equal(typeof PiRpcSession, "function");

  const stream = new PassThrough();
  const lines = [];
  createLineReader(stream, (line) => lines.push(line));
  stream.end('{"x":1}\n{"y":2}\n');
  await new Promise((resolve) => stream.on("end", resolve));
  assert.deepEqual(lines, ['{"x":1}', '{"y":2}']);

  const adapter = new PiAcpAdapter({ piCommand: process.execPath, piModeArgs: [], piArgs: ["-e", "process.stdin.resume()"] });
  const initialized = await adapter.handle({ jsonrpc: "2.0", id: "init", method: "initialize", params: { protocolVersion: 1 } });
  assert.equal(initialized.result.agentInfo.name, "pi-acp");
  adapter.closeAll();

  const updates = piEventToAcpNotifications("s1", { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "hi" } });
  assert.equal(updates[0].method, "session/update");
});
