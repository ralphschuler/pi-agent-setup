// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseFrames, sendFrame, wsAcceptKey } from "../shared/websocket.ts";
import { isAuthed, isTrustedOrigin, requiresCsrfCheck } from "./auth.ts";
import { json, readBody, safeHandleApi } from "./http.ts";

const DEFAULT_HOST = process.env.PI_WEB_TERMINAL_HOST || "127.0.0.1";
const DEFAULT_PORT = Number(process.env.PI_WEB_TERMINAL_PORT || 17474);
const INITIAL_TOKEN = process.env.PI_WEB_TERMINAL_TOKEN || crypto.randomBytes(18).toString("base64url");
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const IS_CHILD = process.env.PI_WEB_TERMINAL_CHILD === "1";

type WebSocketClient = {
  id: string;
  socket: import("node:net").Socket;
  child?: ChildProcessWithoutNullStreams;
  connectedAt: number;
};

type SseClient = http.ServerResponse;

const SKIP_DIRS = new Set(["node_modules", ".git", ".todos", "dist", "build", ".next", ".nuxt", "__pycache__"]);

function sse(req: http.IncomingMessage, res: http.ServerResponse, clients: Set<SseClient>, initial: unknown) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(`data: ${JSON.stringify(initial)}\n\n`);
  clients.add(res);
  const keepalive = setInterval(() => {
    if (!res.writable) {
      clearInterval(keepalive);
      clients.delete(res);
      return;
    }
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(keepalive);
      clients.delete(res);
    }
  }, 15000);
  req.on("close", () => {
    clearInterval(keepalive);
    clients.delete(res);
  });
}

function broadcast(clients: Set<SseClient>, data: unknown) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    if (!res.writable) {
      clients.delete(res);
      continue;
    }
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function safeResolve(cwd: string, requestedPath: string) {
  const resolved = path.resolve(cwd, requestedPath || ".");
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) return null;
  try {
    const real = fs.realpathSync(resolved);
    if (!real.startsWith(cwd + path.sep) && real !== cwd) return null;
    return real;
  } catch {
    return resolved;
  }
}

function localAddresses(port: number, host = DEFAULT_HOST) {
  const addresses = [`http://localhost:${port}`];
  if (host === "0.0.0.0" || host === "::") {
    for (const entries of Object.values(os.networkInterfaces())) {
      for (const entry of entries || []) {
        if (entry.family === "IPv4" && !entry.internal) addresses.push(`http://${entry.address}:${port}`);
      }
    }
  } else if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    addresses.push(`http://${host}:${port}`);
  }
  return [...new Set(addresses)];
}

function contentType(file: string) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function spawnPiTerminal(cwd: string, cols?: number, rows?: number) {
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

export default function webTerminal(pi: ExtensionAPI) {
  if (IS_CHILD) return;

  let server: http.Server | undefined;
  let port = DEFAULT_PORT;
  let currentToken = INITIAL_TOKEN;
  let currentCwd = process.cwd();
  const clients = new Map<string, WebSocketClient>();
  const eventClients = new Set<SseClient>();
  const logClients = new Set<SseClient>();
  const logBuffer: unknown[] = [];

  function log(level: string, source: string, msg: string) {
    const entry = { level, source, msg, time: new Date().toISOString() };
    logBuffer.push(entry);
    while (logBuffer.length > 300) logBuffer.shift();
    broadcast(logClients, entry);
  }

  function rotateToken() {
    currentToken = crypto.randomBytes(18).toString("base64url");
    return currentToken;
  }

  function setupUrls() {
    return localAddresses(port).map((url) => `${url}/login?token=${encodeURIComponent(currentToken)}`);
  }

  function statusText() {
    if (!server) return "web terminal: inactive";
    return clients.size > 0 ? `web terminal: ${clients.size} connected on :${port}` : `web terminal: waiting on :${port}`;
  }

  async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, apiPath: string) {
    const anyPi = pi as any;
    const p = apiPath.replace(/\/+$/, "") || "/";
    if (p === "/health") return json(res, 200, { ok: true, clients: clients.size, time: new Date().toISOString() });
    if (p === "/status") {
      const mem = process.memoryUsage();
      const tools = typeof anyPi.getAllTools === "function" ? anyPi.getAllTools() : [];
      return json(res, 200, {
        agent: { status: "healthy", cwd: currentCwd },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          uptimeSeconds: Math.round(process.uptime()),
          memoryMB: Math.round(mem.rss / 1024 / 1024),
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        },
        terminal: { clients: clients.size, port },
        tools: { count: tools.length, names: tools.map((t: any) => t.name).sort() },
      });
    }
    if (p === "/settings")
      return json(res, 200, {
        host: DEFAULT_HOST,
        port,
        tokenSet: Boolean(currentToken),
        command: process.env.PI_WEB_TERMINAL_COMMAND || "pi -c",
        cwd: currentCwd,
      });
    if (p === "/chat/commands") return json(res, 200, { commands: typeof anyPi.getCommands === "function" ? anyPi.getCommands() : [] });
    if (p === "/chat/events") return sse(req, res, eventClients, { type: "connected", time: new Date().toISOString() });
    if (p === "/chat/prompt" && req.method === "POST") {
      try {
        const body = JSON.parse(await readBody(req));
        if (!body.prompt || typeof body.prompt !== "string") return json(res, 400, { error: "Missing prompt" });
        if (body.streamingBehavior) pi.sendUserMessage(body.prompt, { deliverAs: body.streamingBehavior });
        else pi.sendUserMessage(body.prompt);
        broadcast(eventClients, { type: "user_prompt", text: body.prompt, time: new Date().toISOString() });
        log("info", "chat", `prompt submitted: ${body.prompt.slice(0, 80)}`);
        return json(res, 200, { ok: true });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "Invalid JSON" });
      }
    }
    if (p === "/files/list") {
      const url = new URL(req.url || "/", "http://localhost");
      const resolved = safeResolve(currentCwd, url.searchParams.get("path") || ".");
      if (!resolved) return json(res, 400, { error: "Invalid path" });
      try {
        const items = fs
          .readdirSync(resolved, { withFileTypes: true })
          .filter((e) => !e.name.startsWith(".") && !SKIP_DIRS.has(e.name))
          .map((e) => {
            const full = path.join(resolved, e.name);
            const stat = fs.statSync(full);
            return {
              name: e.name,
              path: path.relative(currentCwd, full),
              type: e.isDirectory() ? "directory" : "file",
              size: e.isDirectory() ? 0 : stat.size,
              modified: stat.mtime.toISOString(),
            };
          })
          .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));
        return json(res, 200, { path: path.relative(currentCwd, resolved) || ".", items });
      } catch {
        return json(res, 404, { error: "Directory not found" });
      }
    }
    if (p === "/files/read") {
      const url = new URL(req.url || "/", "http://localhost");
      const resolved = safeResolve(currentCwd, url.searchParams.get("path") || ".");
      if (!resolved) return json(res, 400, { error: "Invalid path" });
      try {
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) return json(res, 400, { error: "Is a directory" });
        if (stat.size > 512 * 1024) return json(res, 400, { error: "File too large" });
        return json(res, 200, { path: path.relative(currentCwd, resolved), content: fs.readFileSync(resolved, "utf8"), size: stat.size });
      } catch {
        return json(res, 404, { error: "File not found" });
      }
    }
    if (p === "/logs") return json(res, 200, { logs: logBuffer });
    if (p === "/logs/events") return sse(req, res, logClients, { type: "connected", time: new Date().toISOString() });
    if (p === "/skills") {
      const tools = typeof anyPi.getAllTools === "function" ? anyPi.getAllTools() : [];
      return json(res, 200, { skills: tools.map((t: any) => ({ name: t.name, description: t.description || "" })) });
    }
    if (p === "/extensions") {
      const tools = typeof anyPi.getAllTools === "function" ? anyPi.getAllTools() : [];
      const grouped: Record<string, string[]> = {};
      for (const t of tools) {
        const prefix = t.name?.includes("_") ? t.name.split("_")[0] : "core";
        (grouped[prefix] ||= []).push(t.name);
      }
      return json(res, 200, {
        extensions: Object.entries(grouped).map(([name, toolNames]) => ({ name, tools: toolNames, toolCount: toolNames.length })),
      });
    }
    async function execJson(command: string, args: string[], fallbackKey: string) {
      try {
        const result = await anyPi.exec(command, args, { timeout: 10000 });
        const out = (result.stdout || "").trim();
        if (result.code === 0 && out) {
          try {
            return JSON.parse(out);
          } catch {
            return { raw: out };
          }
        }
      } catch {}
      return { [fallbackKey]: [] };
    }
    async function runCli(command: string, args: string[]) {
      const result = await anyPi.exec(command, args, { timeout: 15000 });
      return { ok: result.code === 0, output: (result.stdout || result.stderr || "").trim(), code: result.code };
    }
    if (p === "/tasks" && req.method === "GET") return json(res, 200, await execJson("td", ["list", "--json"], "issues"));
    if (p === "/tasks" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const args = ["create", body.title || "Untitled"];
      if (body.type) args.push("--type", body.type);
      if (body.priority) args.push("--priority", body.priority);
      if (body.labels) args.push("--label", Array.isArray(body.labels) ? body.labels.join(",") : body.labels);
      return json(res, 200, await runCli("td", args));
    }
    if (p.startsWith("/tasks/") && req.method === "PATCH") {
      const id = decodeURIComponent(p.split("/")[2] || "");
      const body = JSON.parse(await readBody(req));
      const action =
        body.action === "start" ? "start" : body.action === "close" ? "close" : body.action === "reopen" ? "reopen" : undefined;
      if (!action) return json(res, 400, { error: "Unknown action" });
      return json(res, 200, await runCli("td", [action, id]));
    }
    if (p === "/cron" && req.method === "GET") return json(res, 200, await execJson("pi-cron", ["list", "--json"], "jobs"));
    if (p.startsWith("/cron/") && req.method === "POST") {
      const [, , name, action] = p.split("/");
      if (action === "run") return json(res, 200, await runCli("pi-cron", ["run", decodeURIComponent(name)]));
      if (action === "toggle") {
        const body = JSON.parse(await readBody(req));
        return json(res, 200, await runCli("pi-cron", [body.enabled ? "enable" : "disable", decodeURIComponent(name)]));
      }
    }
    if (p === "/crm" && req.method === "GET") return json(res, 200, await execJson("pi-crm", ["contacts", "list", "--json"], "contacts"));
    if (p === "/crm" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const args = ["contacts", "create", body.name || "Unknown"];
      if (body.email) args.push("--email", body.email);
      if (body.company) args.push("--company", body.company);
      return json(res, 200, await runCli("pi-crm", args));
    }
    if (p === "/calendar" && req.method === "GET")
      return json(res, 200, await execJson("pi-calendar", ["events", "list", "--json"], "events"));
    if (p === "/calendar" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const args = ["events", "create", body.title || "Untitled"];
      if (body.date) args.push("--date", body.date);
      if (body.time) args.push("--time", body.time);
      return json(res, 200, await runCli("pi-calendar", args));
    }
    return json(res, 404, { error: "Not found" });
  }

  async function startServer(cwd: string) {
    currentCwd = cwd;
    if (server) return;
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const authed = isAuthed(req, url, currentToken);

      if (url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, clients: clients.size, port }));
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        if (!authed) return json(res, 401, { error: "Unauthorized" });
        if (requiresCsrfCheck(req, url) && !isTrustedOrigin(req)) return json(res, 403, { error: "Untrusted origin" });
        void safeHandleApi(res, () => handleApi(req, res, url.pathname.slice("/api".length)));
        return;
      }

      if (url.pathname === "/login") {
        if (url.searchParams.get("token") === currentToken) {
          res.writeHead(302, {
            location: "/",
            "set-cookie": `pi_web_terminal_token=${encodeURIComponent(currentToken)}; HttpOnly; SameSite=Lax; Path=/`,
          });
          res.end();
          return;
        }
        res.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
        res.end("Invalid token");
        return;
      }

      if (!authed) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><title>Pi Web Terminal</title><body style="background:#101014;color:#f5f5f7;font:16px system-ui;padding:2rem"><h1>Pi Web Terminal</h1><p>Open the authenticated setup URL from <code>/web-terminal</code>.</p><form action="/login"><input name="token" placeholder="Token" autofocus style="font:inherit;padding:.6rem;background:#181820;color:white;border:1px solid #444;border-radius:8px"><button style="font:inherit;margin-left:.5rem;padding:.6rem">Open</button></form></body>`,
        );
        return;
      }

      const filePath = path.normalize(url.pathname === "/" ? "/index.html" : url.pathname);
      if (filePath.includes("..")) {
        res.writeHead(400);
        res.end("bad path");
        return;
      }
      const absolute = path.join(PUBLIC_DIR, filePath);
      fs.readFile(absolute, (error, data) => {
        if (error) {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("not found");
          return;
        }
        res.writeHead(200, {
          "content-type": contentType(absolute),
          "cache-control": absolute.endsWith("sw.js") ? "no-cache" : "public, max-age=300",
        });
        res.end(data);
      });
    });

    server.on("upgrade", (req, socket) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const authed = isAuthed(req, url, currentToken);
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
    });

    await new Promise<void>((resolve, reject) => {
      const activeServer = server!;
      const onError = (error: Error) => {
        activeServer.close(() => {});
        if (server === activeServer) server = undefined;
        reject(error);
      };
      activeServer.once("error", onError);
      activeServer.listen(port, DEFAULT_HOST, () => {
        activeServer.off("error", onError);
        resolve();
      });
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    currentCwd = ctx.cwd;
    ctx.ui.setStatus("web-terminal", statusText());
  });

  pi.on("agent_start", async () => {
    broadcast(eventClients, { type: "agent_start", time: new Date().toISOString() });
    log("info", "agent", "agent started");
  });

  pi.on("agent_end", async () => {
    broadcast(eventClients, { type: "agent_end", time: new Date().toISOString() });
    log("info", "agent", "agent finished");
  });

  pi.on("message_update", async (event) => {
    const delta = (event as any).assistantMessageEvent;
    if (delta?.type === "text_delta") broadcast(eventClients, { type: "text_delta", delta: delta.delta, time: new Date().toISOString() });
    if (delta?.type === "thinking_delta")
      broadcast(eventClients, { type: "thinking_delta", delta: delta.delta, time: new Date().toISOString() });
  });

  pi.on("turn_end", async (event) => {
    const content: unknown[] = [];
    const message = (event as any).message;
    if (Array.isArray(message?.content)) {
      for (const block of message.content) {
        if (block.type === "text") content.push({ type: "text", text: String(block.text || "").slice(0, 8192) });
        if (block.type === "thinking") content.push({ type: "thinking", thinking: String(block.thinking || "").slice(0, 4096) });
      }
    }
    broadcast(eventClients, {
      type: "turn_end",
      content,
      toolResults: (event as any).toolResults?.length || 0,
      time: new Date().toISOString(),
    });
  });

  pi.on("tool_call", async (event) => {
    broadcast(eventClients, { type: "tool_start", toolName: event.toolName, toolCallId: event.toolCallId, time: new Date().toISOString() });
    log("info", "tool", `→ ${event.toolName}`);
  });

  pi.on("tool_result", async (event) => {
    const content =
      event.content?.filter((c: any) => c.type === "text").map((c: any) => ({ type: "text", text: String(c.text || "").slice(0, 4096) })) ||
      [];
    broadcast(eventClients, {
      type: "tool_end",
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      isError: event.isError,
      content,
      time: new Date().toISOString(),
    });
    log(event.isError ? "error" : "info", "tool", `← ${event.toolName}${event.isError ? " (error)" : ""}`);
  });

  pi.on("session_shutdown", async () => {
    for (const client of clients.values()) {
      client.child?.kill("SIGTERM");
      client.socket.destroy();
    }
    clients.clear();
    for (const res of eventClients) {
      try {
        res.end();
      } catch {}
    }
    eventClients.clear();
    for (const res of logClients) {
      try {
        res.end();
      } catch {}
    }
    logClients.clear();
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    server = undefined;
  });

  pi.registerCommand("web-terminal", {
    description: "Show the authenticated web/PWA terminal URL for this pi session",
    handler: async (_args, ctx) => {
      await startServer(ctx.cwd);
      rotateToken();
      const urls = setupUrls();
      const message = [
        `Web terminal token generated.`,
        `Open: ${urls[0]}`,
        urls.length > 1 ? `LAN: ${urls.slice(1).join(" or ")}` : undefined,
      ]
        .filter(Boolean)
        .join("\n");
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerTool({
    name: "web_terminal",
    label: "Web Terminal",
    description: "Show status and setup URLs for the Hyper-inspired Pi Web Terminal PWA.",
    promptSnippet: "Expose this pi session through an authenticated browser terminal/PWA.",
    promptGuidelines: ["Use web_terminal status/setup when the user asks for the browser/PWA terminal URL."],
    parameters: Type.Object({ action: Type.Union([Type.Literal("status"), Type.Literal("setup")]) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.action === "status" && !server) {
        return {
          content: [{ type: "text", text: "Web terminal server: inactive\nRun setup to activate the web terminal server." }],
          details: { active: false, host: DEFAULT_HOST, port, clients: clients.size, urls: [] },
        };
      }

      await startServer(ctx.cwd);
      if (params.action === "setup") rotateToken();
      const urls = setupUrls();
      return {
        content: [
          {
            type: "text",
            text: [
              `Web terminal server: ${DEFAULT_HOST}:${port}`,
              `Connected terminals: ${clients.size}`,
              `Open: ${urls.join(" or ")}`,
              `Token: ${currentToken}`,
            ].join("\n"),
          },
        ],
        details: { active: true, host: DEFAULT_HOST, port, clients: clients.size, urls, token: currentToken },
      };
    },
  });
}
