// @ts-nocheck
import { json } from "./http.ts";

export function handleResourceRoute(_req: any, res: any, p: string, ctx: any) {
  const anyPi = ctx.pi as any;
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
  return false;
}
