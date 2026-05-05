// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import crypto from "node:crypto";
import type http from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Socket } from "node:net";
import { parseFrames, sendFrame, wsAcceptKey } from "../shared/websocket.ts";
import { isAuthed, isTrustedOrigin } from "./auth.ts";

export type WebSocketClient = {
  id: string;
  socket: Socket;
  child?: ChildProcessWithoutNullStreams;
  connectedAt: number;
};

export function spawnPiTerminal(cwd: string, cols?: number, rows?: number) {
  const command = process.env.PI_WEB_TERMINAL_COMMAND || "pi -c";
  const env = {
    ...process.env,
    PI_WEB_TERMINAL_CHILD: "1",
    TERM: process.env.PI_WEB_TERMINAL_TERM || "xterm-256color",
    COLORTERM: process.env.COLORTERM || "truecolor",
    COLUMNS: String(cols || 120),
    LINES: String(rows || 34),
  };

  // `script` allocates a real pseudo-terminal without native node-pty dependencies.
  // It is available on typical Linux/macOS systems. Override PI_WEB_TERMINAL_COMMAND
  // to run a shell or a specific pi invocation.
  return spawn("script", ["-qefc", command, "/dev/null"], { cwd, env });
}

export function handleTerminalUpgrade(options: {
  pi: ExtensionAPI;
  req: http.IncomingMessage;
  socket: Socket;
  token: string;
  cwd: string;
  clients: Map<string, WebSocketClient>;
  log: (level: string, source: string, msg: string) => void;
}) {
  const { pi, req, socket, token, cwd, clients, log } = options;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const authed = isAuthed(req, url, token);
  if (url.pathname !== "/terminal" || !authed) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  if (!isTrustedOrigin(req)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  if (!key || Array.isArray(key)) {
    socket.destroy();
    return;
  }
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${wsAcceptKey(key)}`,
      "\r\n",
    ].join("\r\n"),
  );

  const cols = Number(url.searchParams.get("cols") || 120);
  const rows = Number(url.searchParams.get("rows") || 34);
  const client: WebSocketClient = { id: crypto.randomUUID().slice(0, 8), socket, connectedAt: Date.now() };
  log("info", "terminal", `connected ${client.id}`);
  client.child = spawnPiTerminal(cwd, cols, rows);
  clients.set(client.id, client);
  pi.appendEntry("web-terminal-connection", { id: client.id, connectedAt: client.connectedAt, cwd });

  sendFrame(socket, { type: "status", text: `Connected to pi terminal ${client.id} in ${cwd}\r\n` });
  client.child.on("error", (error) => {
    const message = `Failed to start terminal: ${error.message}`;
    log("error", "terminal", message);
    sendFrame(socket, { type: "exit", code: null, signal: null, text: `\r\n[${message}]\r\n` });
    clients.delete(client.id);
    socket.destroy();
  });
  client.child.stdout.on("data", (chunk) => sendFrame(socket, { type: "output", data: chunk.toString("utf8") }));
  client.child.stderr.on("data", (chunk) => sendFrame(socket, { type: "output", data: chunk.toString("utf8") }));
  client.child.on("exit", (code, signal) => {
    log(signal ? "warning" : "info", "terminal", `exited ${client.id}: ${signal || code}`);
    sendFrame(socket, { type: "exit", code, signal, text: `\r\n[pi terminal exited: ${signal || code}]\r\n` });
  });

  let buffered = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk]);
    const parsed = parseFrames(buffered);
    buffered = parsed.remaining;
    if (parsed.error) log("warning", "terminal", parsed.error);
    if (parsed.close) socket.destroy();
    for (const message of parsed.messages) {
      try {
        const payload = JSON.parse(message);
        if (payload.type === "input" && typeof payload.data === "string") client.child?.stdin.write(payload.data);
        if (payload.type === "resize")
          sendFrame(socket, {
            type: "status",
            text: `\r\n[resize ${payload.cols}x${payload.rows}; restart tab to apply terminal geometry]\r\n`,
          });
        if (payload.type === "kill") client.child?.kill("SIGTERM");
      } catch {
        // Ignore malformed client messages.
      }
    }
  });
  socket.on("close", () => {
    log("info", "terminal", `disconnected ${client.id}`);
    client.child?.kill("SIGTERM");
    clients.delete(client.id);
  });
}
