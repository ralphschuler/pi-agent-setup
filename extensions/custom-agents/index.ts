import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import {
  deleteCustomAgent,
  formatAgentCatalog,
  readCustomAgents,
  type AgentScope,
  writeCustomAgent,
  type CustomAgentInfo,
} from "./registry";

function helpText() {
  return [
    "Custom agents command:",
    "",
    "/agent                 Show this help and list custom agents",
    "/agent list            List custom user/project agents",
    "/agent new             Create a custom agent interactively",
    "/agent show <name>     Show agent details and file path",
    "/agent delete <name>   Delete a custom agent",
    "",
    "Agents use standard folders: ~/.pi/agent/agents, ~/.agents, nearest .pi/agents, and legacy nearest .agents."
  ].join("\n");
}

function parseArgs(args: string) {
  const [command = "", ...rest] = args.trim().split(/\s+/).filter(Boolean);
  return { command: command.toLowerCase(), rest };
}

class AgentCatalogComponent {
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(private agents: CustomAgentInfo[], private theme: Theme, private onClose: () => void) {}

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) this.onClose();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    const th = this.theme;
    const user = this.agents.filter((agent) => agent.scope === "user").length;
    const project = this.agents.filter((agent) => agent.scope === "project").length;
    const lines: string[] = [""];
    lines.push(truncateToWidth(`${th.fg("borderMuted", "──")} ${th.fg("accent", th.bold("Custom Agents"))} ${th.fg("muted", `${project} project / ${user} user`)}`, width));
    lines.push("");
    if (this.agents.length === 0) {
      lines.push(truncateToWidth(`  ${th.fg("dim", "No custom agents yet. Use /agent new to create one.")}`, width));
    } else {
      for (const agent of this.agents) {
        const scope = agent.scope === "project" ? th.fg("success", "project") : th.fg("warning", "user");
        lines.push(truncateToWidth(`  ${th.fg("accent", agent.runtimeName)} ${scope}`, width));
        lines.push(truncateToWidth(`     ${th.fg("muted", agent.description || "No description")}`, width));
        lines.push(truncateToWidth(`     ${th.fg("dim", agent.path)}`, width));
      }
    }
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("dim", "/agent new create • /agent show <name> inspect • esc close")}`, width));
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

async function showAgentCatalog(ctx: any, agents: CustomAgentInfo[]) {
  if (!ctx.hasUI) return ctx.ui.notify(formatAgentCatalog(agents), "info");
  await ctx.ui.custom<void>((_tui: any, theme: Theme, _kb: any, done: () => void) => new AgentCatalogComponent(agents, theme, () => done()));
}

export default function customAgents(pi: ExtensionAPI) {
  pi.registerCommand("agent", {
    description: "List, create, show, or delete custom subagent definitions",
    getArgumentCompletions: (prefix: string) => {
      const values = ["list", "new", "show", "delete"];
      return values.filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      const { command, rest } = parseArgs(args || "");

      if (!command || command === "help") {
        const agents = await readCustomAgents(ctx.cwd);
        if (ctx.hasUI) await showAgentCatalog(ctx, agents);
        else ctx.ui.notify(`${helpText()}\n\n${formatAgentCatalog(agents)}`, "info");
        return;
      }

      if (command === "list") {
        const agents = await readCustomAgents(ctx.cwd);
        await showAgentCatalog(ctx, agents);
        return;
      }

      if (command === "show") {
        const name = rest.join(" ").trim();
        if (!name) {
          ctx.ui.notify("Usage: /agent show <name>", "error");
          return;
        }
        const agents = (await readCustomAgents(ctx.cwd)).filter((agent) => agent.runtimeName === name || agent.name === name);
        if (agents.length === 0) {
          ctx.ui.notify(`No custom agent named ${name}. Use /agent new to create it.`, "error");
          return;
        }
        ctx.ui.notify(agents.map((agent) => [
          `${agent.runtimeName} (${agent.scope})`,
          agent.description || "No description",
          `Path: ${agent.path}`,
          agent.body ? `\n${agent.body.slice(0, 1800)}` : "",
        ].join("\n")).join("\n\n---\n\n"), "info");
        return;
      }

      if (command === "delete") {
        const name = rest.join(" ").trim();
        if (!name) {
          ctx.ui.notify("Usage: /agent delete <name>", "error");
          return;
        }
        const ok = await ctx.ui.confirm("Delete custom agent?", `Delete ${name}? This removes the markdown file.`);
        if (!ok) return;
        try {
          const deleted = await deleteCustomAgent(ctx.cwd, name);
          ctx.ui.notify(`Deleted ${deleted.runtimeName} from ${deleted.path}`, "success");
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
        return;
      }

      if (command === "new" || command === "create") {
        const scopeChoice = await ctx.ui.select("Where should this custom agent be stored?", [
          "project — standard nearest .pi/agents folder",
          "user — standard user agents folder",
        ]);
        if (!scopeChoice) return;
        const scope: AgentScope = scopeChoice.startsWith("user") ? "user" : "project";
        const name = await ctx.ui.input("Agent name", "e.g. api-reviewer");
        if (!name?.trim()) return;
        const pkg = await ctx.ui.input("Optional package/group", "custom");
        const description = await ctx.ui.input("Short description", "What should this agent be used for?");
        if (!description?.trim()) return;
        const defaultContextChoice = await ctx.ui.select("Default context?", [
          "fresh — independent context by default",
          "fork — inherit the current parent session",
        ]);
        const systemPrompt = await ctx.ui.editor("System prompt / instructions", [
          "You are a specialized subagent.",
          "",
          "Purpose:",
          "- ...",
          "",
          "Workflow:",
          "- Inspect the relevant files directly.",
          "- Do not spawn subagents; the parent session owns orchestration.",
          "- Escalate unapproved product, architecture, or scope decisions.",
          "",
          "Output:",
          "- Concise summary with evidence, changed files or findings, validation, and risks.",
        ].join("\n"));
        if (!systemPrompt?.trim()) return;

        const created = await writeCustomAgent(ctx.cwd, {
          scope,
          name,
          package: pkg?.trim() || "custom",
          description,
          defaultContext: defaultContextChoice?.startsWith("fork") ? "fork" : "fresh",
          inheritProjectContext: true,
          inheritSkills: true,
          systemPromptMode: "replace",
          systemPrompt,
        });
        ctx.ui.notify(`Created ${created.runtimeName}\n${created.path}\n\nRun /reload if it is not immediately visible to the custom subagent tool.`, "success");
        return;
      }

      ctx.ui.notify(`Unknown /agent command: ${command}\n\n${helpText()}`, "error");
    },
  });

  pi.on("session_start", async (event, ctx) => {
    if (event.reason === "startup" || event.reason === "reload") {
      const count = (await readCustomAgents(ctx.cwd)).length;
      ctx.ui.setStatus("custom-agents", count ? `custom agents: ${count}` : "custom agents: none");
    }
  });
}
