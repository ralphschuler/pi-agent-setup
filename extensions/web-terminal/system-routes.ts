// @ts-nocheck
import { json } from "./http.ts";

export function handleSystemRoute(_req: any, res: any, p: string, ctx: any) {
  const anyPi = ctx.pi as any;
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
      host: ctx.host,
      port: ctx.port,
      tokenSet: true,
      command: process.env.PI_WEB_TERMINAL_COMMAND || "pi -c",
      cwd: ctx.cwd,
    });
  return false;
}
