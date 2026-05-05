// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { broadcast, sse, type SseClient } from "./events.ts";
import { json, readBody } from "./http.ts";

const SKIP_DIRS = new Set(["node_modules", ".git", ".todos", "dist", "build", ".next", ".nuxt", "__pycache__"]);

export type WebTerminalApiContext = {
  pi: ExtensionAPI;
  cwd: string;
  port: number;
  clients: { size: number };
  eventClients: Set<SseClient>;
  logClients: Set<SseClient>;
  logBuffer: unknown[];
  log: (level: string, source: string, msg: string) => void;
};

export function safeResolve(cwd: string, requestedPath: string) {
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

export async function execJson(anyPi: any, command: string, args: string[], fallbackKey: string) {
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

export async function runCli(anyPi: any, command: string, args: string[]) {
  const result = await anyPi.exec(command, args, { timeout: 15000 });
  return { ok: result.code === 0, output: (result.stdout || result.stderr || "").trim(), code: result.code };
}

export async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, apiPath: string, ctx: WebTerminalApiContext) {
  const anyPi = ctx.pi as any;
  const p = apiPath.replace(/\/+$/, "") || "/";
  if (p === "/health") return json(res, 200, { ok: true, clients: ctx.clients.size, time: new Date().toISOString() });
  if (p === "/status") {
    const mem = process.memoryUsage();
    const tools = typeof anyPi.getAllTools === "function" ? anyPi.getAllTools() : [];
    return json(res, 200, {
      agent: { status: "healthy", cwd: ctx.cwd },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: Math.round(process.uptime()),
        memoryMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      },
      terminal: { clients: ctx.clients.size, port: ctx.port },
      tools: { count: tools.length, names: tools.map((t: any) => t.name).sort() },
    });
  }
  if (p === "/settings")
    return json(res, 200, {
      host: process.env.PI_WEB_TERMINAL_HOST || "127.0.0.1",
      port: ctx.port,
      tokenSet: true,
      command: process.env.PI_WEB_TERMINAL_COMMAND || "pi -c",
      cwd: ctx.cwd,
    });
  if (p === "/chat/commands") return json(res, 200, { commands: typeof anyPi.getCommands === "function" ? anyPi.getCommands() : [] });
  if (p === "/chat/events") return sse(req, res, ctx.eventClients, { type: "connected", time: new Date().toISOString() });
  if (p === "/chat/prompt" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.prompt || typeof body.prompt !== "string") return json(res, 400, { error: "Missing prompt" });
      if (body.streamingBehavior) ctx.pi.sendUserMessage(body.prompt, { deliverAs: body.streamingBehavior });
      else ctx.pi.sendUserMessage(body.prompt);
      broadcast(ctx.eventClients, { type: "user_prompt", text: body.prompt, time: new Date().toISOString() });
      ctx.log("info", "chat", `prompt submitted: ${body.prompt.slice(0, 80)}`);
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "Invalid JSON" });
    }
  }
  if (p === "/files/list") {
    const url = new URL(req.url || "/", "http://localhost");
    const resolved = safeResolve(ctx.cwd, url.searchParams.get("path") || ".");
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
            path: path.relative(ctx.cwd, full),
            type: e.isDirectory() ? "directory" : "file",
            size: e.isDirectory() ? 0 : stat.size,
            modified: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));
      return json(res, 200, { path: path.relative(ctx.cwd, resolved) || ".", items });
    } catch {
      return json(res, 404, { error: "Directory not found" });
    }
  }
  if (p === "/files/read") {
    const url = new URL(req.url || "/", "http://localhost");
    const resolved = safeResolve(ctx.cwd, url.searchParams.get("path") || ".");
    if (!resolved) return json(res, 400, { error: "Invalid path" });
    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) return json(res, 400, { error: "Is a directory" });
      if (stat.size > 512 * 1024) return json(res, 400, { error: "File too large" });
      return json(res, 200, { path: path.relative(ctx.cwd, resolved), content: fs.readFileSync(resolved, "utf8"), size: stat.size });
    } catch {
      return json(res, 404, { error: "File not found" });
    }
  }
  if (p === "/logs") return json(res, 200, { logs: ctx.logBuffer });
  if (p === "/logs/events") return sse(req, res, ctx.logClients, { type: "connected", time: new Date().toISOString() });
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
  if (p === "/tasks" && req.method === "GET") return json(res, 200, await execJson(anyPi, "td", ["list", "--json"], "issues"));
  if (p === "/tasks" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const args = ["create", body.title || "Untitled"];
    if (body.type) args.push("--type", body.type);
    if (body.priority) args.push("--priority", body.priority);
    if (body.labels) args.push("--label", Array.isArray(body.labels) ? body.labels.join(",") : body.labels);
    return json(res, 200, await runCli(anyPi, "td", args));
  }
  if (p.startsWith("/tasks/") && req.method === "PATCH") {
    const id = decodeURIComponent(p.split("/")[2] || "");
    const body = JSON.parse(await readBody(req));
    const action = body.action === "start" ? "start" : body.action === "close" ? "close" : body.action === "reopen" ? "reopen" : undefined;
    if (!action) return json(res, 400, { error: "Unknown action" });
    return json(res, 200, await runCli(anyPi, "td", [action, id]));
  }
  if (p === "/cron" && req.method === "GET") return json(res, 200, await execJson(anyPi, "pi-cron", ["list", "--json"], "jobs"));
  if (p.startsWith("/cron/") && req.method === "POST") {
    const [, , name, action] = p.split("/");
    if (action === "run") return json(res, 200, await runCli(anyPi, "pi-cron", ["run", decodeURIComponent(name)]));
    if (action === "toggle") {
      const body = JSON.parse(await readBody(req));
      return json(res, 200, await runCli(anyPi, "pi-cron", [body.enabled ? "enable" : "disable", decodeURIComponent(name)]));
    }
  }
  if (p === "/crm" && req.method === "GET")
    return json(res, 200, await execJson(anyPi, "pi-crm", ["contacts", "list", "--json"], "contacts"));
  if (p === "/crm" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const args = ["contacts", "create", body.name || "Unknown"];
    if (body.email) args.push("--email", body.email);
    if (body.company) args.push("--company", body.company);
    return json(res, 200, await runCli(anyPi, "pi-crm", args));
  }
  if (p === "/calendar" && req.method === "GET")
    return json(res, 200, await execJson(anyPi, "pi-calendar", ["events", "list", "--json"], "events"));
  if (p === "/calendar" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const args = ["events", "create", body.title || "Untitled"];
    if (body.date) args.push("--date", body.date);
    if (body.time) args.push("--time", body.time);
    return json(res, 200, await runCli(anyPi, "pi-calendar", args));
  }
  return json(res, 404, { error: "Not found" });
}
