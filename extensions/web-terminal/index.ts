// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAuthed, isTrustedOrigin, requiresCsrfCheck } from "./auth.ts";
import { broadcast, type SseClient } from "./events.ts";
import { json, safeHandleApi } from "./http.ts";
import { handleApi } from "./routes.ts";
import { handleTerminalUpgrade, type WebSocketClient } from "./terminal-session.ts";

function env(name: string) {
  const exact = process.env[name];
  if (exact !== undefined) return exact;
  const match = Object.keys(process.env).find((key) => key.toUpperCase() === name);
  return match ? process.env[match] : undefined;
}

const DEFAULT_HOST = env("PI_WEB_TERMINAL_HOST") || "127.0.0.1";
const DEFAULT_PORT = Number(env("PI_WEB_TERMINAL_PORT") || 17474);
const INITIAL_TOKEN = env("PI_WEB_TERMINAL_TOKEN") || crypto.randomBytes(18).toString("base64url");
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const IS_CHILD = process.env.PI_WEB_TERMINAL_CHILD === "1";
let runtimeHost: string | undefined;
let runtimePort: number | undefined;

function normalizeHost(value: unknown) {
  const host = typeof value === "string" ? value.trim() : "";
  if (!host) return undefined;
  if (!/^[a-zA-Z0-9:._-]+$/.test(host)) throw new Error("Invalid host. Use an IP address or hostname.");
  return host;
}

function normalizePort(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port. Use 1-65535.");
  return port;
}

function configureBind(options: { host?: unknown; port?: unknown }) {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  if (host !== undefined) runtimeHost = host;
  if (port !== undefined) runtimePort = port;
}

function configuredHost() {
  return runtimeHost || env("PI_WEB_TERMINAL_HOST") || DEFAULT_HOST;
}

function configuredPort() {
  const configured = runtimePort || Number(env("PI_WEB_TERMINAL_PORT") || DEFAULT_PORT);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PORT;
}

export function localAddresses(port: number, host = configuredHost()) {
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

function loginPage() {
  return `<!doctype html><title>Pi Web Terminal</title><body style="background:#101014;color:#f5f5f7;font:16px system-ui;padding:2rem"><h1>Pi Web Terminal</h1><p>Open the authenticated setup URL from <code>/web-terminal</code>.</p><form action="/login"><input name="token" placeholder="Token" autofocus style="font:inherit;padding:.6rem;background:#181820;color:white;border:1px solid #444;border-radius:8px"><button style="font:inherit;margin-left:.5rem;padding:.6rem">Open</button></form></body>`;
}

function serveStatic(url: URL, res: http.ServerResponse) {
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
}

export default function webTerminal(pi: ExtensionAPI) {
  if (IS_CHILD) return;

  let server: http.Server | undefined;
  let host = configuredHost();
  let port = configuredPort();
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
    return localAddresses(port, host).map((url) => `${url}/login?token=${encodeURIComponent(currentToken)}`);
  }

  function statusText() {
    if (!server) return "web terminal: inactive";
    const bind = `${host}:${port}`;
    return clients.size > 0 ? `web terminal: ${clients.size} connected on ${bind}` : `web terminal: waiting on ${bind}`;
  }

  async function stopServer() {
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
  }

  async function startServer(cwd: string) {
    currentCwd = cwd;
    const desiredHost = configuredHost();
    const desiredPort = configuredPort();
    if (server && (host !== desiredHost || port !== desiredPort)) await stopServer();
    if (server) return;
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const authed = isAuthed(req, url, currentToken);

      if (url.pathname === "/health") return json(res, 200, { ok: true, clients: clients.size, port });

      if (url.pathname.startsWith("/api/")) {
        if (!authed) return json(res, 401, { error: "Unauthorized" });
        if (requiresCsrfCheck(req, url) && !isTrustedOrigin(req)) return json(res, 403, { error: "Untrusted origin" });
        void safeHandleApi(res, () =>
          handleApi(req, res, url.pathname.slice("/api".length), {
            pi,
            cwd: currentCwd,
            host,
            port,
            clients,
            eventClients,
            logClients,
            logBuffer,
            log,
          }),
        );
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
        res.end(loginPage());
        return;
      }

      serveStatic(url, res);
    });

    // Terminal adapter keeps WebSocket auth/origin failures explicit, including HTTP/1.1 403 Forbidden.
    server.on("upgrade", (req, socket) => handleTerminalUpgrade({ pi, req, socket, token: currentToken, cwd, clients, log }));

    await new Promise<void>((resolve, reject) => {
      const activeServer = server!;
      const onError = (error: Error) => {
        activeServer.close(() => {});
        if (server === activeServer) server = undefined;
        reject(error);
      };
      activeServer.once("error", onError);
      activeServer.listen(desiredPort, desiredHost, () => {
        activeServer.off("error", onError);
        host = desiredHost;
        port = desiredPort;
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
    await stopServer();
  });

  pi.registerCommand("web-terminal", {
    description: "Show the authenticated web/PWA terminal URL for this pi session",
    handler: async (args, ctx) => {
      const parts = String(args || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const hostArg = parts.find((part) => part.startsWith("--host="))?.slice("--host=".length) || parts[0];
      const portArg = parts.find((part) => part.startsWith("--port="))?.slice("--port=".length);
      configureBind({ host: hostArg, port: portArg });
      await startServer(ctx.cwd);
      rotateToken();
      const urls = setupUrls();
      const message = [
        `Web terminal token generated.`,
        `Bind: ${host}:${port}`,
        `Open: ${urls[0]}`,
        urls.length > 1
          ? `LAN: ${urls.slice(1).join(" or ")}`
          : host === "127.0.0.1"
            ? `LAN: disabled; run /web-terminal 0.0.0.0 to bind all interfaces.`
            : undefined,
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
    parameters: Type.Object({
      action: Type.Union([Type.Literal("status"), Type.Literal("setup")]),
      host: Type.Optional(Type.String({ description: "Optional bind host for setup, e.g. 0.0.0.0 for LAN access." })),
      port: Type.Optional(Type.Number({ description: "Optional bind port for setup." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.action === "setup") configureBind({ host: params.host, port: params.port });
      if (params.action === "status" && !server) {
        return {
          content: [{ type: "text", text: "Web terminal server: inactive\nRun setup to activate the web terminal server." }],
          details: { active: false, host: configuredHost(), port: configuredPort(), clients: clients.size, urls: [] },
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
              `Web terminal server: ${host}:${port}`,
              `Connected terminals: ${clients.size}`,
              `Open: ${urls.join(" or ")}`,
              `Token: ${currentToken}`,
            ].join("\n"),
          },
        ],
        details: { active: true, host, port, clients: clients.size, urls, token: currentToken },
      };
    },
  });
}
