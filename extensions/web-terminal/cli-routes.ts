// @ts-nocheck
import { json, readBody } from "./http.ts";

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

export async function handleCliRoute(req: any, res: any, p: string, ctx: any) {
  const anyPi = ctx.pi as any;
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
  return false;
}
