// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import http from "node:http";
import { handleChatRoute } from "./chat-routes.ts";
import { execJson, handleCliRoute, runCli } from "./cli-routes.ts";
import { handleFileRoute, safeResolve } from "./file-routes.ts";
import { handleLogRoute } from "./log-routes.ts";
import { handleResourceRoute } from "./resource-routes.ts";
import { handleSystemRoute } from "./system-routes.ts";
import { json } from "./http.ts";
import type { SseClient } from "./events.ts";

export { execJson, runCli, safeResolve };

export type WebTerminalApiContext = {
  pi: ExtensionAPI;
  cwd: string;
  host: string;
  port: number;
  clients: { size: number };
  eventClients: Set<SseClient>;
  logClients: Set<SseClient>;
  logBuffer: unknown[];
  log: (level: string, source: string, msg: string) => void;
};

export async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, apiPath: string, ctx: WebTerminalApiContext) {
  const p = apiPath.replace(/\/+$/, "") || "/";
  const handlers = [handleSystemRoute, handleChatRoute, handleFileRoute, handleLogRoute, handleResourceRoute, handleCliRoute];
  for (const handler of handlers) {
    const handled = await handler(req, res, p, ctx);
    if (handled !== false || res.headersSent || res.writableEnded) return;
  }
  return json(res, 404, { error: "Not found" });
}
