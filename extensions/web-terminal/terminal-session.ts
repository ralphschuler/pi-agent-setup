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
  markdownState?: MarkdownAnsiState;
};

type MarkdownAnsiState = { inFence: boolean };

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  dim: "\x1b[2m",
  cyan: "\x1b[38;2;104;225;253m",
  magenta: "\x1b[38;2;199;146;234m",
  yellow: "\x1b[38;2;255;209;102m",
};

function style(text: string, ...codes: string[]) {
  return `${codes.join("")}${text}${ANSI.reset}`;
}

export function renderMarkdownAnsi(chunk: string, state: MarkdownAnsiState = { inFence: false }) {
  if (process.env.PI_WEB_TERMINAL_MARKDOWN === "0") return chunk;
  if (!chunk || /[\x1b\x9b]/.test(chunk)) return chunk;
  return chunk
    .split(/(\r?\n)/)
    .map((part) => {
      if (part === "\n" || part === "\r\n") return part;
      return renderMarkdownLine(part, state);
    })
    .join("");
}

function renderMarkdownLine(line: string, state: MarkdownAnsiState) {
  const fence = line.match(/^\s*```/);
  if (fence) {
    state.inFence = !state.inFence;
    return style("─".repeat(Math.max(3, line.length || 12)), ANSI.dim);
  }
  if (state.inFence) return style(line, ANSI.yellow);

  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    const level = heading[1].length;
    const text = renderInlineMarkdown(heading[2]);
    return level <= 2 ? style(text, ANSI.bold, ANSI.underline, ANSI.cyan) : style(text, ANSI.bold, ANSI.cyan);
  }

  if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) return style("─".repeat(48), ANSI.dim);

  const quote = line.match(/^>\s?(.*)$/);
  if (quote) return style(`│ ${renderInlineMarkdown(quote[1])}`, ANSI.dim, ANSI.italic);

  return renderInlineMarkdown(line);
}

function renderInlineMarkdown(text: string) {
  return text
    .replace(/`([^`]+)`/g, (_m, code) => style(code, ANSI.yellow))
    .replace(/\*\*([^*]+)\*\*/g, (_m, inner) => style(inner, ANSI.bold))
    .replace(/__([^_]+)__/g, (_m, inner) => style(inner, ANSI.bold))
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, (_m, prefix, inner) => `${prefix}${style(inner, ANSI.italic)}`)
    .replace(/(^|[^_])_([^_\s][^_]*?)_(?!_)/g, (_m, prefix, inner) => `${prefix}${style(inner, ANSI.italic)}`)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_m, label, url) => `${style(label, ANSI.underline, ANSI.cyan)} ${style(url, ANSI.dim)}`,
    );
}

export function spawnPiTerminal(cwd: string, cols?: number, rows?: number) {
  const command = process.env.PI_WEB_TERMINAL_COMMAND || "pi -c";
  const { NO_COLOR: _noColor, ...baseEnv } = process.env;
  const env = {
    ...baseEnv,
    PI_WEB_TERMINAL_CHILD: "1",
    TERM: process.env.PI_WEB_TERMINAL_TERM || "xterm-256color",
    TERM_PROGRAM: process.env.TERM_PROGRAM || "pi-web-terminal",
    COLORTERM: process.env.COLORTERM || "truecolor",
    FORCE_COLOR: process.env.FORCE_COLOR || "1",
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
  const client: WebSocketClient = {
    id: crypto.randomUUID().slice(0, 8),
    socket,
    connectedAt: Date.now(),
    markdownState: { inFence: false },
  };
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
  client.child.stdout.on("data", (chunk) =>
    sendFrame(socket, { type: "output", data: renderMarkdownAnsi(chunk.toString("utf8"), client.markdownState) }),
  );
  client.child.stderr.on("data", (chunk) =>
    sendFrame(socket, { type: "output", data: renderMarkdownAnsi(chunk.toString("utf8"), client.markdownState) }),
  );
  client.child.on("exit", (code, signal) => {
    log(signal ? "warning" : "info", "terminal", `exited ${client.id}: ${signal || code}`);
    sendFrame(socket, { type: "exit", code, signal, text: `\r\n[pi terminal exited: ${signal || code}]\r\n` });
  });

  let buffered = Buffer.alloc(0);
  let lastResizeNotice = "";
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
        if (payload.type === "resize") {
          const size = `${Number(payload.cols) || 0}x${Number(payload.rows) || 0}`;
          if (size !== lastResizeNotice) {
            lastResizeNotice = size;
            sendFrame(socket, {
              type: "status",
              text: `\r\n[resize ${size}; terminal geometry changes require opening a new tab]\r\n`,
            });
          }
        }
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
