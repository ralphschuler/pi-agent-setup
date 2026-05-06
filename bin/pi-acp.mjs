#!/usr/bin/env node
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

export const ACP_PROTOCOL_VERSION = 1;
export const ADAPTER_NAME = "pi-acp";
export const DEFAULT_PI_COMMAND = process.env.PI_ACP_PI_COMMAND || "pi";

export function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

export function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id: id ?? null, error };
}

export function sessionUpdate(sessionId, update) {
  return { jsonrpc: "2.0", method: "session/update", params: { sessionId, update } };
}

export function parseJsonLines(buffer, chunk) {
  const text = buffer + chunk;
  const lines = [];
  let start = 0;
  while (true) {
    const index = text.indexOf("\n", start);
    if (index === -1) break;
    let line = text.slice(start, index);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.trim()) lines.push(line);
    start = index + 1;
  }
  return { lines, rest: text.slice(start) };
}

export function contentBlocksToPrompt(blocks) {
  if (!Array.isArray(blocks)) return "";
  const parts = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
    if (block.type === "resource_link" && typeof block.uri === "string") parts.push(`Context resource: ${block.uri}`);
    if (block.type === "resource" && typeof block.resource?.text === "string") parts.push(block.resource.text);
  }
  return parts.join("\n\n").trim();
}

export function contentBlocksToImages(blocks) {
  if (!Array.isArray(blocks)) return [];
  const images = [];
  for (const block of blocks) {
    if (block?.type !== "image") continue;
    if (typeof block.data === "string" && typeof block.mimeType === "string") {
      images.push({ type: "image", data: block.data, mimeType: block.mimeType });
    }
  }
  return images;
}

export function mapToolKind(name) {
  const lower = String(name || "").toLowerCase();
  if (["read", "grep", "find", "ls"].includes(lower)) return "read";
  if (["edit", "write"].includes(lower)) return "edit";
  if (["bash", "process"].includes(lower)) return "execute";
  if (lower.includes("search")) return "search";
  if (lower.includes("browser") || lower.includes("fetch")) return "fetch";
  if (lower.includes("todo") || lower.includes("memory")) return "other";
  return "other";
}

export function textFromToolResult(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((entry) => entry?.type === "text")
    .map((entry) => String(entry.text || ""))
    .join("\n")
    .slice(0, 12000);
}

export function isDialogUiRequest(event) {
  return event?.type === "extension_ui_request" && ["select", "confirm", "input", "editor"].includes(event.method);
}

export function piEventToAcpNotifications(sessionId, event) {
  if (!event || typeof event !== "object") return [];
  const delta = event.assistantMessageEvent;
  if (event.type === "message_update" && delta?.type === "text_delta") {
    return [sessionUpdate(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: String(delta.delta || "") } })];
  }
  if (event.type === "message_update" && delta?.type === "thinking_delta") {
    return [sessionUpdate(sessionId, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: String(delta.delta || "") } })];
  }
  if (event.type === "tool_execution_start") {
    return [
      sessionUpdate(sessionId, {
        sessionUpdate: "tool_call",
        toolCallId: String(event.toolCallId || crypto.randomUUID()),
        title: `Running ${event.toolName || "tool"}`,
        kind: mapToolKind(event.toolName),
        status: "pending",
        rawInput: event.args ?? null,
      }),
    ];
  }
  if (event.type === "tool_execution_update") {
    return [
      sessionUpdate(sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId: String(event.toolCallId || "unknown"),
        status: "in_progress",
        content: [{ type: "content", content: { type: "text", text: textFromToolResult(event.partialResult) } }],
        rawOutput: event.partialResult ?? null,
      }),
    ];
  }
  if (event.type === "tool_execution_end") {
    return [
      sessionUpdate(sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId: String(event.toolCallId || "unknown"),
        status: event.isError ? "failed" : "completed",
        content: [{ type: "content", content: { type: "text", text: textFromToolResult(event.result) } }],
        rawOutput: event.result ?? null,
      }),
    ];
  }
  if (event.type === "extension_ui_request") {
    return [
      sessionUpdate(sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: `\n[pi-acp blocked extension UI request: ${event.method || "unknown"}. Continue this session in Pi terminal for user interaction.]\n`,
        },
      }),
    ];
  }
  return [];
}

function createLineReader(stream, onLine) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  stream.on("data", (chunk) => {
    const parsed = parseJsonLines(buffer, decoder.write(chunk));
    buffer = parsed.rest;
    for (const line of parsed.lines) onLine(line);
  });
  stream.on("end", () => {
    const parsed = parseJsonLines(buffer, decoder.end());
    for (const line of parsed.lines) onLine(line);
    buffer = parsed.rest;
  });
}

class PiRpcSession {
  constructor({ sessionId, cwd, write, piCommand = DEFAULT_PI_COMMAND, piModeArgs = ["--mode", "rpc"], piArgs = [] }) {
    this.sessionId = sessionId;
    this.cwd = cwd;
    this.write = write;
    this.nextId = 1;
    this.pending = new Map();
    this.promptWaiter = undefined;
    this.closedError = undefined;
    this.closing = false;
    this.child = spawn(piCommand, [...piModeArgs, ...piArgs], {
      cwd,
      env: { ...process.env, PI_WEB_TERMINAL_CHILD: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    createLineReader(this.child.stdout, (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk) => {
      this.write(
        sessionUpdate(sessionId, {
          sessionUpdate: "tool_call_update",
          toolCallId: "pi-rpc-stderr",
          status: "in_progress",
          title: "Pi RPC stderr",
          content: [{ type: "content", content: { type: "text", text: String(chunk).slice(0, 4000) } }],
        }),
      );
    });
    const failClosed = (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.closedError = error;
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.promptWaiter?.resolve("cancelled");
      this.promptWaiter = undefined;
      this.write(
        sessionUpdate(sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `\n[pi-acp: pi RPC process unavailable: ${error.message}]\n` },
        }),
      );
    };
    this.child.on("error", failClosed);
    this.child.on("exit", (code, signal) => {
      if (this.closing) return;
      const reason = signal || (code ?? "unknown");
      failClosed(new Error(`pi rpc exited (${reason})`));
    });
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type === "response" && message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.success) pending.resolve(message.data ?? {});
      else pending.reject(new Error(message.error || "Pi RPC command failed"));
      return;
    }
    if (isDialogUiRequest(message)) {
      this.child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: message.id, cancelled: true })}\n`);
    }
    for (const notification of piEventToAcpNotifications(this.sessionId, message)) this.write(notification);
    if (message.type === "agent_end") {
      this.promptWaiter?.resolve("end_turn");
      this.promptWaiter = undefined;
    }
  }

  request(command) {
    if (this.closedError) return Promise.reject(this.closedError);
    const id = `pi-acp-${this.nextId++}`;
    const payload = { id, ...command };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  async prompt(message, images) {
    if (this.promptWaiter) throw new Error("A prompt is already running for this ACP session");
    const waiter = new Promise((resolve) => {
      this.promptWaiter = { resolve };
    });
    try {
      await this.request({ type: "prompt", message, images });
      return await waiter;
    } catch (error) {
      this.promptWaiter = undefined;
      throw error;
    }
  }

  async abort() {
    this.promptWaiter?.resolve("cancelled");
    this.promptWaiter = undefined;
    await this.request({ type: "abort" });
  }

  close() {
    this.closing = true;
    this.child.kill("SIGTERM");
  }
}

export class PiAcpAdapter {
  constructor({ write, piCommand = DEFAULT_PI_COMMAND, piModeArgs = ["--mode", "rpc"], piArgs = [] } = {}) {
    this.write = write || ((message) => process.stdout.write(`${JSON.stringify(message)}\n`));
    this.piCommand = piCommand;
    this.piModeArgs = piModeArgs;
    this.piArgs = piArgs;
    this.sessions = new Map();
  }

  async handle(message) {
    if (!message || typeof message !== "object") return jsonRpcError(null, -32600, "Invalid Request");
    const { id, method, params } = message;
    try {
      switch (method) {
        case "initialize":
          return jsonRpcResult(id, this.initialize(params || {}));
        case "authenticate":
          return jsonRpcResult(id, {});
        case "session/new":
          return jsonRpcResult(id, await this.newSession(params || {}));
        case "session/prompt":
          return jsonRpcResult(id, await this.prompt(params || {}));
        case "session/cancel":
          await this.cancel(params || {});
          return id === undefined ? undefined : jsonRpcResult(id, {});
        case "session/close":
          await this.closeSession(params || {});
          return id === undefined ? undefined : jsonRpcResult(id, {});
        case "session/set_mode":
          return jsonRpcResult(id, {});
        default:
          return jsonRpcError(id, -32601, `Unsupported ACP method: ${method}`);
      }
    } catch (error) {
      return jsonRpcError(id, -32000, error instanceof Error ? error.message : String(error));
    }
  }

  initialize(params) {
    const requested = Number(params.protocolVersion || ACP_PROTOCOL_VERSION);
    return {
      protocolVersion: Math.min(requested || ACP_PROTOCOL_VERSION, ACP_PROTOCOL_VERSION),
      agentInfo: { name: ADAPTER_NAME, version: "0.1.0" },
      authMethods: [],
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: { image: true, embeddedContext: true },
        sessionCapabilities: { close: {} },
      },
    };
  }

  async newSession(params) {
    const cwd = typeof params.cwd === "string" && params.cwd ? params.cwd : process.cwd();
    const sessionId = crypto.randomUUID();
    this.sessions.set(
      sessionId,
      new PiRpcSession({ sessionId, cwd, write: this.write, piCommand: this.piCommand, piModeArgs: this.piModeArgs, piArgs: this.piArgs }),
    );
    return { sessionId };
  }

  requireSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown ACP session: ${sessionId}`);
    return session;
  }

  async prompt(params) {
    const session = this.requireSession(params.sessionId);
    const message = contentBlocksToPrompt(params.prompt);
    const images = contentBlocksToImages(params.prompt);
    if (!message && images.length === 0) throw new Error("session/prompt requires text or image content");
    const stopReason = await session.prompt(message, images);
    return { stopReason: stopReason || "end_turn", userMessageId: params.messageId ?? undefined };
  }

  async cancel(params) {
    await this.requireSession(params.sessionId).abort();
  }

  async closeSession(params) {
    const session = this.requireSession(params.sessionId);
    session.close();
    this.sessions.delete(params.sessionId);
  }

  closeAll() {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}

export async function runAcpServer({ input = process.stdin, output = process.stdout, piCommand, piArgs } = {}) {
  const adapter = new PiAcpAdapter({
    piCommand,
    piArgs,
    write: (message) => output.write(`${JSON.stringify(message)}\n`),
  });
  createLineReader(input, async (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      output.write(
        `${JSON.stringify(jsonRpcError(null, -32700, "Parse error", error instanceof Error ? error.message : String(error)))}\n`,
      );
      return;
    }
    const response = await adapter.handle(message);
    if (response) output.write(`${JSON.stringify(response)}\n`);
  });
  const cleanup = () => adapter.closeAll();
  process.once("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      [
        "Usage: pi-acp [pi rpc options...]",
        "",
        "Experimental Agent Client Protocol stdio adapter for pi.",
        "Starts `pi --mode rpc` and translates ACP JSON-RPC messages over stdio.",
        "Any arguments are forwarded to the child pi process after `--mode rpc`.",
        "",
      ].join("\n"),
    );
    process.exit(0);
  }
  await runAcpServer({ piArgs: args });
}
