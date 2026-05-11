import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { VERSION } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const WELCOME_TYPE = "pi-welcome-screen";
type WelcomeMode = "compact" | "full";
type FactRow = readonly [label: string, value: string];

type WelcomeDetails = {
  title: string;
  subtitle: string;
  mode: WelcomeMode;
  facts: FactRow[];
};

const LOGO = ["      ▟██▙", "   ▟██▛▜██▙", " ▟██▛  ▐██▛", "▐██▌  ▟██▛ ", "▝███▟██▛  ", "  ▝██▛    "];
const MODE_USAGE = "Usage: /welcome [compact|full]";

export default function welcomeScreen(pi: ExtensionAPI) {
  pi.registerMessageRenderer(WELCOME_TYPE, (message, _options, theme) => welcomeComponent(message.details as WelcomeDetails, theme));

  pi.on("session_start", async (event, ctx) => {
    if (event.reason === "startup" || event.reason === "reload") showWelcome(pi, ctx, "compact");
  });

  pi.registerCommand("welcome", {
    description: "Show the pi agent welcome screen (compact|full)",
    handler: async (args, ctx) => {
      const mode = parseWelcomeMode(args);
      if (!mode) return showUsage(pi, ctx);
      showWelcome(pi, ctx, mode);
    },
  });
}

function parseWelcomeMode(args: string | undefined): WelcomeMode | null {
  const value = (args || "").trim().toLowerCase();
  if (!value) return "compact";
  if (value === "compact" || value === "full") return value;
  return null;
}

function showWelcome(pi: ExtensionAPI, ctx: any, mode: WelcomeMode) {
  pi.sendMessage({
    customType: WELCOME_TYPE,
    content: `Pi agent welcome (${mode})`,
    display: true,
    details: buildFacts(pi, ctx, mode),
  });
}

function showUsage(pi: ExtensionAPI, ctx: any) {
  pi.sendMessage({
    customType: WELCOME_TYPE,
    content: MODE_USAGE,
    display: true,
    details: {
      title: "pi agent",
      subtitle: MODE_USAGE,
      mode: "compact",
      facts: buildCompactFacts(pi, ctx),
    },
  });
}

function buildFacts(pi: ExtensionAPI, ctx: any, mode: WelcomeMode): WelcomeDetails {
  return {
    title: "pi agent",
    subtitle: mode === "full" ? "session cockpit // full" : "session cockpit",
    mode,
    facts: mode === "full" ? buildFullFacts(pi, ctx) : buildCompactFacts(pi, ctx),
  };
}

function buildCompactFacts(pi: ExtensionAPI, ctx: any): FactRow[] {
  const cwd = ctx?.cwd || process.cwd();
  const git = gitSummary(cwd);
  return [
    ["model", modelName(ctx)],
    ["cwd", formatPath(cwd)],
    ["git", git.compact],
    ["context", contextSummary(ctx)],
    ["tools", toolsSummary(pi)],
    ["think", thinkingSummary(pi)],
    ["host", hostSummary()],
    ["theme", configuredTheme() || "auto"],
  ];
}

function buildFullFacts(pi: ExtensionAPI, ctx: any): FactRow[] {
  const cwd = ctx?.cwd || process.cwd();
  const git = gitSummary(cwd);
  return [
    ["version", VERSION || "unknown"],
    ["model", modelName(ctx)],
    ["cwd", formatPath(cwd)],
    ["git", git.full],
    ["session", sessionSummary(pi, ctx)],
    ["entries", entrySummary(ctx)],
    ["context", contextSummary(ctx)],
    ["tools", toolsSummary(pi, true)],
    ["think", thinkingSummary(pi)],
    ["node", process.version],
    ["host", hostSummary()],
    ["os", `${os.platform()} ${os.release()}`],
    ["theme", configuredTheme() || "auto"],
  ];
}

function welcomeComponent(details: WelcomeDetails, theme: any) {
  return {
    invalidate() {},
    render(width: number): string[] {
      const safeWidth = Math.max(1, width || 1);
      const facts = Array.isArray(details?.facts) ? details.facts : [];
      const logoWidth = LOGO.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);
      const gap = safeWidth >= 72 ? 4 : 2;
      const showLogo = safeWidth >= 46 && logoWidth > 0;
      const factWidth = showLogo ? Math.max(12, safeWidth - logoWidth - gap) : safeWidth;
      const lines: string[] = [];
      const title = `${theme.bold(theme.fg("accent", details?.title || "pi agent"))} ${theme.fg("dim", "//")} ${theme.fg("muted", details?.subtitle || "ready")}`;
      const factLines = [title, theme.fg("dim", "─".repeat(Math.min(36, Math.max(1, factWidth))))];
      const keyWidth = Math.max(6, ...facts.map(([key]) => visibleWidth(String(key))));

      for (const [key, value] of facts) {
        const label = String(key).padStart(keyWidth);
        factLines.push(`${theme.fg("borderAccent", label)} ${theme.fg("dim", "→")} ${theme.fg("text", String(value))}`);
      }

      const height = Math.max(showLogo ? LOGO.length : 0, factLines.length);
      for (let i = 0; i < height; i++) {
        const right = truncateToWidth(factLines[i] || "", factWidth);
        if (!showLogo) {
          lines.push(truncateToWidth(right, safeWidth));
          continue;
        }
        const rawLogo = LOGO[i] || "";
        const logo = theme.fg(i % 2 === 0 ? "accent" : "borderAccent", rawLogo.padEnd(logoWidth));
        const pad = " ".repeat(gap);
        lines.push(truncateToWidth(`${logo}${pad}${right}`, safeWidth));
      }
      return lines;
    },
  };
}

function gitSummary(cwd: string) {
  const branch = gitBranch(cwd);
  if (!branch) return { compact: "none", full: "none" };

  const dirty = gitDirty(cwd);
  const upstream = gitUpstream(cwd);
  const state = dirty ? "dirty" : "clean";
  const compact = upstream ? `${branch} ${state} ${upstream}` : `${branch} ${state}`;
  const full = upstream ? `${branch} (${state}, ${upstream})` : `${branch} (${state})`;
  return { compact, full };
}

function gitBranch(cwd: string) {
  return execGit(cwd, ["branch", "--show-current"]);
}

function gitDirty(cwd: string) {
  return Boolean(execGit(cwd, ["status", "--short"]));
}

function gitUpstream(cwd: string) {
  const counts = execGit(cwd, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]);
  if (!counts) return "";
  const [behindRaw, aheadRaw] = counts.split(/\s+/);
  const behind = Number(behindRaw || 0);
  const ahead = Number(aheadRaw || 0);
  if (!ahead && !behind) return "synced";
  const parts = [];
  if (ahead) parts.push(`↑${ahead}`);
  if (behind) parts.push(`↓${behind}`);
  return parts.join(" ");
}

function execGit(cwd: string, args: string[]) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1500 }).trim();
  } catch {
    return "";
  }
}

function modelName(ctx: any) {
  const model = ctx?.model;
  if (!model) return "unknown";
  return [model.provider, model.id].filter(Boolean).join("/") || model.id || "unknown";
}

function sessionSummary(pi: ExtensionAPI, ctx: any) {
  try {
    const name = typeof pi.getSessionName === "function" ? pi.getSessionName() : "";
    const file = ctx?.sessionManager?.getSessionFile?.();
    if (name) return name;
    if (file) return formatPath(String(file));
  } catch {}
  return "ephemeral";
}

function entrySummary(ctx: any) {
  try {
    const branch = ctx?.sessionManager?.getBranch?.();
    if (Array.isArray(branch)) return String(branch.length);
  } catch {}
  return "unknown";
}

function contextSummary(ctx: any) {
  try {
    const usage = ctx?.getContextUsage?.();
    if (usage?.tokens != null) return `${fmt(usage.tokens)} tokens`;
  } catch {}
  return "unknown";
}

function toolsSummary(pi: ExtensionAPI, full = false) {
  try {
    const tools = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : [];
    if (!Array.isArray(tools)) return "unknown";
    if (!full) return `${tools.length} active`;
    const names = tools.map((tool: any) => (typeof tool === "string" ? tool : tool?.name)).filter(Boolean);
    return names.length ? `${names.length}: ${names.slice(0, 8).join(", ")}${names.length > 8 ? ", …" : ""}` : "0 active";
  } catch {}
  return "unknown";
}

function thinkingSummary(pi: ExtensionAPI) {
  try {
    return typeof pi.getThinkingLevel === "function" ? pi.getThinkingLevel() || "off" : "unknown";
  } catch {}
  return "unknown";
}

function hostSummary() {
  try {
    return `${os.userInfo().username}@${os.hostname()}`;
  } catch {
    return os.hostname() || "unknown";
  }
}

function formatPath(value: string) {
  const home = os.homedir();
  const pretty = value.startsWith(home) ? `~${value.slice(home.length)}` : value;
  return pretty.split(path.sep).filter(Boolean).slice(-3).join(path.sep) || pretty;
}

function configuredTheme() {
  try {
    const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return typeof parsed.theme === "string" && parsed.theme.trim() ? parsed.theme.trim() : "";
  } catch {
    return "";
  }
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "unknown";
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}
