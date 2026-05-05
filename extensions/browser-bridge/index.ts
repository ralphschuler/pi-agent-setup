// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrames, sendFrame, wsAcceptKey } from "../shared/websocket.ts";

const DEFAULT_PORT = Number(process.env.PI_BROWSER_BRIDGE_PORT || 17373);
const DEFAULT_HOST = process.env.PI_BROWSER_BRIDGE_HOST || "127.0.0.1";
const TOKEN = process.env.PI_BROWSER_BRIDGE_TOKEN || crypto.randomBytes(18).toString("base64url");
const EXTENSION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "browser-extension");

type BrowserClient = {
  socket: import("node:net").Socket;
  id: string;
  connectedAt: number;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

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

export default function browserBridge(pi: ExtensionAPI) {
  let server: http.Server | undefined;
  let port = DEFAULT_PORT;
  let client: BrowserClient | undefined;
  const pending = new Map<string, PendingRequest>();

  function statusText() {
    return client ? `browser bridge: connected (${client.id})` : `browser bridge: waiting on :${port}`;
  }

  function settle(id: string, payload: any) {
    const request = pending.get(id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(id);
    if (payload.ok) request.resolve(payload.result);
    else request.reject(new Error(payload.error || "Browser bridge command failed"));
  }

  function callBrowser(action: string, args: Record<string, unknown>, timeoutMs = 15000) {
    if (!client) throw new Error("No browser extension is connected. Run /browser-bridge and connect the companion extension first.");
    const id = crypto.randomUUID();
    sendFrame(client.socket, { id, action, args });
    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for browser response to ${action}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timeout });
    });
  }

  async function startServer() {
    if (server) return;
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, connected: Boolean(client), port }));
        return;
      }
      if (
        url.pathname === "/extension/background.js" ||
        url.pathname === "/extension/manifest.json" ||
        url.pathname === "/extension/popup.html" ||
        url.pathname === "/extension/popup.js"
      ) {
        const file = path.join(EXTENSION_DIR, path.basename(url.pathname));
        import("node:fs").then((fs) => {
          fs.readFile(file, (err, data) => {
            if (err) {
              res.writeHead(404);
              res.end("not found");
              return;
            }
            const type = file.endsWith(".json") ? "application/json" : file.endsWith(".html") ? "text/html" : "text/javascript";
            res.writeHead(200, { "content-type": type });
            res.end(data);
          });
        });
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(
        [
          "Pi Browser Bridge",
          "",
          `WebSocket URL: ws://${req.headers.host || `localhost:${port}`}/bridge?token=${TOKEN}`,
          `Token: ${TOKEN}`,
          "",
          "Install companion extension:",
          `1. Copy this folder to the browser machine: ${EXTENSION_DIR}`,
          "2. In Chrome/Edge, open chrome://extensions, enable Developer mode, Load unpacked.",
          "3. Open the Pi Browser Bridge extension popup and set the WebSocket URL/token.",
        ].join("\n"),
      );
    });

    server.on("upgrade", (req, socket) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (url.pathname !== "/bridge" || url.searchParams.get("token") !== TOKEN) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
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

      if (client) client.socket.destroy();
      client = { socket, id: crypto.randomUUID().slice(0, 8), connectedAt: Date.now() };
      pi.appendEntry("browser-bridge-connection", { connectedAt: client.connectedAt, id: client.id });
      socket.on(
        "data",
        (() => {
          let buffered = Buffer.alloc(0);
          return (chunk: Buffer) => {
            buffered = Buffer.concat([buffered, chunk]);
            const parsed = parseFrames(buffered);
            buffered = parsed.remaining;
            if (parsed.close) socket.destroy();
            for (const message of parsed.messages) {
              try {
                const payload = JSON.parse(message);
                if (payload.id) settle(payload.id, payload);
              } catch {
                // Ignore malformed browser messages.
              }
            }
          };
        })(),
      );
      socket.on("close", () => {
        if (client?.socket === socket) client = undefined;
      });
      sendFrame(socket, { action: "hello", args: { server: "pi-browser-bridge" } });
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
    try {
      await startServer();
      ctx.ui.setStatus("browser-bridge", statusText());
    } catch (error) {
      ctx.ui.notify(
        `Browser bridge failed to listen on ${DEFAULT_HOST}:${port}: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    for (const request of pending.values()) clearTimeout(request.timeout);
    pending.clear();
    client?.socket.destroy();
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    server = undefined;
  });

  pi.registerCommand("browser-bridge", {
    description: "Show browser bridge connection instructions",
    handler: async (_args, ctx) => {
      await startServer();
      const urls = localAddresses(port);
      ctx.ui.notify(`Browser bridge ${client ? "connected" : "waiting"}. Open ${urls[0]} for setup details.`, client ? "success" : "info");
    },
  });

  pi.registerTool({
    name: "browser_bridge",
    label: "Browser Bridge",
    description: "Control a connected Chrome/Edge browser on another machine via the Pi Browser Bridge companion extension.",
    promptSnippet:
      "Control a connected remote browser: status, navigate, click, type, read page text/html, evaluate JavaScript, screenshot, history, or reload.",
    promptGuidelines: [
      "Use browser_bridge only after checking status or when the user asks to interact with a browser.",
      "Use browser_bridge get_text before making assumptions about the current page.",
      "Use browser_bridge evaluate only for page-scoped JavaScript; do not request secrets or bypass website security controls.",
    ],
    parameters: Type.Object({
      action: Type.Union(
        [
          Type.Literal("status"),
          Type.Literal("setup"),
          Type.Literal("navigate"),
          Type.Literal("back"),
          Type.Literal("forward"),
          Type.Literal("reload"),
          Type.Literal("click"),
          Type.Literal("type"),
          Type.Literal("get_text"),
          Type.Literal("get_html"),
          Type.Literal("evaluate"),
          Type.Literal("screenshot"),
        ],
        { description: "Browser bridge action to perform" },
      ),
      url: Type.Optional(Type.String({ description: "URL for navigate" })),
      selector: Type.Optional(Type.String({ description: "CSS selector for click/type/read actions" })),
      text: Type.Optional(Type.String({ description: "Text for type action" })),
      script: Type.Optional(Type.String({ description: "JavaScript expression/function body for evaluate action" })),
      timeoutMs: Type.Optional(Type.Number({ description: "Command timeout in milliseconds" })),
    }),
    async execute(_toolCallId, params) {
      await startServer();
      if (params.action === "status" || params.action === "setup") {
        const urls = localAddresses(port);
        return {
          content: [
            {
              type: "text",
              text: [
                `Browser bridge server: ${DEFAULT_HOST}:${port}`,
                `Connected browser: ${client ? `yes (${client.id})` : "no"}`,
                `Setup page: ${urls.join(" or ")}`,
                `Token: ${TOKEN}`,
                `Companion extension folder: ${EXTENSION_DIR}`,
              ].join("\n"),
            },
          ],
          details: { connected: Boolean(client), port, host: DEFAULT_HOST, urls, token: TOKEN, extensionDir: EXTENSION_DIR },
        };
      }

      const timeoutMs = params.timeoutMs || (params.action === "screenshot" ? 30000 : 15000);
      const result = await callBrowser(params.action, params as Record<string, unknown>, timeoutMs);
      const preview =
        typeof result === "string"
          ? result.slice(0, 4000)
          : result?.dataUrl
            ? `Screenshot captured (${Math.round(result.dataUrl.length / 1024)} KiB data URL).`
            : JSON.stringify(result, null, 2)?.slice(0, 4000);
      return {
        content: [{ type: "text", text: preview || "Browser command completed." }],
        details: { action: params.action, result },
      };
    },
  });
}
