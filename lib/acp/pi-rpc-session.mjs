import { spawn } from "node:child_process";
import { createLineReader } from "./jsonl.mjs";
import { isDialogUiRequest, piEventToAcpNotifications, sessionUpdate } from "./protocol.mjs";

export const DEFAULT_PI_COMMAND = process.env.PI_ACP_PI_COMMAND || "pi";

export class PiRpcSession {
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
