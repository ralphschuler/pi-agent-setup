// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { WEB_TERMINAL_READ_MAX_BYTES, resolveExistingInsideRoot } from "../shared/safety.ts";
import { json } from "./http.ts";

const SKIP_DIRS = new Set(["node_modules", ".git", ".todos", "dist", "build", ".next", ".nuxt", "__pycache__"]);

export function safeResolve(cwd: string, requestedPath: string) {
  return resolveExistingInsideRoot(cwd, requestedPath);
}

export function handleFileRoute(req: any, res: any, p: string, ctx: any) {
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
      if (stat.size > WEB_TERMINAL_READ_MAX_BYTES) return json(res, 400, { error: "File too large" });
      return json(res, 200, { path: path.relative(ctx.cwd, resolved), content: fs.readFileSync(resolved, "utf8"), size: stat.size });
    } catch {
      return json(res, 404, { error: "File not found" });
    }
  }
  return false;
}
