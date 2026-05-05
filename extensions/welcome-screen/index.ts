// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const WELCOME_TYPE = "pi-welcome-screen";

const LOGO = ["      ▟██▙", "   ▟██▛▜██▙", " ▟██▛  ▐██▛", "▐██▌  ▟██▛ ", "▝███▟██▛  ", "  ▝██▛    "];

export default function welcomeScreen(pi: ExtensionAPI) {
  pi.registerMessageRenderer(WELCOME_TYPE, (message, _options, theme) => welcomeComponent(message.details, theme));

  pi.on("session_start", async (event, ctx) => {
    if (event.reason === "startup" || event.reason === "reload") showWelcome(pi, ctx);
  });

  pi.registerCommand("welcome", {
    description: "Show the pi agent welcome screen",
    handler: async (_args, ctx) => showWelcome(pi, ctx),
  });
}

function showWelcome(pi: ExtensionAPI, ctx: any) {
  pi.sendMessage({
    customType: WELCOME_TYPE,
    content: "Pi agent welcome",
    display: true,
    details: buildFacts(ctx),
  });
}

function buildFacts(ctx: any) {
  const cwd = ctx.cwd || process.cwd();
  return {
    title: "pi agent",
    subtitle: "local coding cockpit",
    facts: [
      ["model", ctx.model?.id || "unknown"],
      ["cwd", formatPath(cwd)],
      ["git", gitBranch(cwd) || "none"],
      ["node", process.version],
      ["host", `${os.userInfo().username}@${os.hostname()}`],
      ["os", `${os.platform()} ${os.release()}`],
      ["theme", configuredTheme() || "auto"],
    ],
  };
}

function welcomeComponent(details: any, theme: any) {
  return {
    invalidate() {},
    render(width: number): string[] {
      const facts = details?.facts || [];
      const logoWidth = Math.max(...LOGO.map((line) => visibleWidth(line)));
      const gap = width >= 72 ? 4 : 2;
      const showLogo = width >= 46;
      const factWidth = showLogo ? Math.max(12, width - logoWidth - gap) : width;
      const lines = [];
      const title = `${theme.bold(theme.fg("accent", details?.title || "pi agent"))} ${theme.fg("dim", "//")} ${theme.fg("muted", details?.subtitle || "ready")}`;
      const factLines = [title, theme.fg("dim", "─".repeat(Math.min(36, factWidth)))];
      for (const [key, value] of facts) {
        factLines.push(`${theme.fg("borderAccent", key.padStart(6))} ${theme.fg("dim", "→")} ${theme.fg("text", String(value))}`);
      }

      const height = Math.max(showLogo ? LOGO.length : 0, factLines.length);
      for (let i = 0; i < height; i++) {
        const right = truncateToWidth(factLines[i] || "", factWidth);
        if (!showLogo) {
          lines.push(right);
          continue;
        }
        const logo = theme.fg(i % 2 === 0 ? "accent" : "borderAccent", LOGO[i] || "".padEnd(logoWidth));
        const pad = " ".repeat(Math.max(0, logoWidth - visibleWidth(LOGO[i] || "")) + gap);
        lines.push(truncateToWidth(`${logo}${pad}${right}`, width));
      }
      return lines;
    },
  };
}

function gitBranch(cwd: string) {
  try {
    return execFileSync("git", ["-C", cwd, "branch", "--show-current"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
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
