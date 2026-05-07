// @ts-nocheck
import { broadcast, sse } from "./events.ts";
import { json, readBody } from "./http.ts";

export async function handleChatRoute(req: any, res: any, p: string, ctx: any) {
  const anyPi = ctx.pi as any;
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
  return false;
}
