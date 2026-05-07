// @ts-nocheck
import { sse } from "./events.ts";
import { json } from "./http.ts";

export function handleLogRoute(req: any, res: any, p: string, ctx: any) {
  if (p === "/logs") return json(res, 200, { logs: ctx.logBuffer });
  if (p === "/logs/events") return sse(req, res, ctx.logClients, { type: "connected", time: new Date().toISOString() });
  return false;
}
