import crypto from "node:crypto";
import { contentBlocksToImages, contentBlocksToPrompt } from "./content.mjs";
import { createLineReader } from "./jsonl.mjs";
import { DEFAULT_PI_COMMAND, PiRpcSession } from "./pi-rpc-session.mjs";
import { ACP_PROTOCOL_VERSION, ADAPTER_NAME, jsonRpcError, jsonRpcResult } from "./protocol.mjs";

export { DEFAULT_PI_COMMAND };

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
