// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const STATUS_LIMIT = 5;

export default function compactFooter(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          const model = compactModel(ctx.model?.id || "no-model");
          const branch = footerData.getGitBranch();
          const usage = usageSummary(ctx);
          const statuses = [...footerData.getExtensionStatuses().entries()]
            .map(([name, value]) => compactStatus(name, value))
            .filter(Boolean)
            .slice(0, STATUS_LIMIT);

          const left = theme.fg("accent", "◆") + " " + theme.fg("text", model);
          const branchPart = branch ? theme.fg("muted", `git:${branch}`) : theme.fg("dim", "no-git");
          const statusPart = statuses.length
            ? statuses.map((s) => colorStatus(theme, s)).join(theme.fg("dim", " · "))
            : theme.fg("dim", "quiet");
          const right = theme.fg("dim", usage);

          return [fitFooter(width, theme, [left, branchPart, statusPart], right)];
        },
      };
    });
  });
}

function fitFooter(width: number, theme: any, leftParts: string[], right: string) {
  const sep = theme.fg("dim", " │ ");
  const parts = [...leftParts];
  while (parts.length > 1) {
    const candidate = joinFooter(parts, right, sep, width);
    if (visibleWidth(candidate) <= width) return candidate;
    parts.splice(parts.length - 1, 1);
  }
  return truncateToWidth(joinFooter(parts, right, sep, width), width);
}

function joinFooter(leftParts: string[], right: string, sep: string, width: number) {
  const left = leftParts.join(sep);
  const gap = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
  return `${left}${gap}${right}`;
}

function usageSummary(ctx: any) {
  let input = 0;
  let output = 0;
  let cost = 0;
  for (const entry of ctx.sessionManager?.getBranch?.() || []) {
    if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
    input += Number(entry.message.usage?.input || 0);
    output += Number(entry.message.usage?.output || 0);
    cost += Number(entry.message.usage?.cost?.total || 0);
  }
  return `↑${fmt(input)} ↓${fmt(output)} $${cost.toFixed(3)}`;
}

function compactStatus(name: string, value: string | undefined) {
  if (!value) return "";
  if (name === "caveman") return value.replace(/^🪨 caveman\s*/, "🪨 ").replace(/\s*•$/, "");
  if (name === "pretty-output") return value.includes("on") ? "pretty" : "";
  if (name === "processes") return value.replace(/^processes:\s*/, "proc ").replace(/ running$/, "r");
  if (name === "cronjobs") return value.replace(/^cron:\s*/, "cron ");
  if (name === "graph-memory") return value.replace(/^memory:\s*/, "mem ").replace(/ nodes.*/, "");
  if (name === "browser-bridge")
    return value.includes("inactive")
      ? "bb off"
      : value
          .replace(/^browser bridge:\s*/, "bb ")
          .replace(/connected \(([^)]+)\)/, "on $1")
          .replace(/waiting on /, "wait ");
  if (name === "web-terminal")
    return value.includes("inactive")
      ? "web off"
      : value
          .replace(/^web terminal:\s*/, "web ")
          .replace(/ connected on .*/, " on")
          .replace(/waiting on /, "wait ");
  if (name === "custom-agents") return value.replace(/^custom agents:\s*/, "agents ");
  return value.length <= 18 ? value : `${name}:on`;
}

function colorStatus(theme: any, status: string) {
  if (/off|inactive|none/.test(status)) return theme.fg("dim", status);
  if (/err|fail|killed/.test(status)) return theme.fg("error", status);
  if (/wait|pending/.test(status)) return theme.fg("warning", status);
  return theme.fg("muted", status);
}

function compactModel(model: string) {
  return model
    .replace(/^openai[-/]/, "")
    .replace(/^anthropic[-/]/, "")
    .replace(/^google[-/]/, "");
}

function fmt(n: number) {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}
