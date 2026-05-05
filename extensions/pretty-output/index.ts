// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool, createFindTool, createGrepTool, createLsTool, createReadTool } from "@mariozechner/pi-coding-agent";
import { Markdown } from "@mariozechner/pi-tui";

const PRETTY_MESSAGE_TYPE = "pretty-output";
const RICH_OUTPUT_PROMPT = [
  "Rich output mode is enabled.",
  "Format user-facing answers with readable Markdown: short headings, bullets, tables when useful, and fenced code blocks with language labels.",
  "Keep content concise; do not add decoration that hides commands, file paths, diffs, errors, or exact output.",
  "For status/progress, prefer compact checklists and clear validation bullets.",
].join("\n");

const TOOL_FACTORIES = {
  bash: createBashTool,
  read: createReadTool,
  grep: createGrepTool,
  find: createFindTool,
  ls: createLsTool,
};

export default function prettyOutput(pi: ExtensionAPI) {
  let enabled = true;

  for (const [name, factory] of Object.entries(TOOL_FACTORIES)) {
    registerPrettyTool(pi, name, factory, () => enabled);
  }

  pi.registerMessageRenderer(PRETTY_MESSAGE_TYPE, (message, _options, theme) => new Markdown(String(message.content || ""), 0, 0, theme));

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("pretty-output", enabled ? "pretty output: on" : undefined);
  });

  pi.on("before_agent_start", async (event) => {
    if (!enabled) return;
    return { systemPrompt: `${event.systemPrompt}\n\n<pretty-output>\n${RICH_OUTPUT_PROMPT}\n</pretty-output>` };
  });

  pi.registerCommand("pretty-output", {
    description: "Toggle rich Markdown assistant guidance and show a pretty-output preview",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "off") enabled = false;
      if (action === "on") enabled = true;
      if (action === "preview") {
        pi.sendMessage({
          customType: PRETTY_MESSAGE_TYPE,
          content:
            "## Pretty output preview\n\n- **Assistant replies** get richer Markdown guidance.\n- **Tool results** render as compact Markdown cards.\n- Exact commands, paths, and errors stay visible.",
          display: true,
          details: { enabled, timestamp: Date.now() },
        });
      }
      ctx.ui.setStatus("pretty-output", enabled ? "pretty output: on" : undefined);
      ctx.ui.notify(`pretty-output: ${enabled ? "on" : "off"}`, "info");
    },
  });
}

function registerPrettyTool(pi: ExtensionAPI, name: string, factory: (cwd: string) => any, isEnabled: () => boolean) {
  const base = factory(process.cwd());
  pi.registerTool({
    ...base,
    async execute(toolCallId: string, params: unknown, signal: AbortSignal, onUpdate: unknown, ctx: { cwd: string }) {
      const tool = factory(ctx.cwd || process.cwd());
      return tool.execute(toolCallId, params, signal, onUpdate, ctx);
    },
    renderResult(result: unknown, options: { expanded?: boolean; isPartial?: boolean }, theme: unknown, context: { args?: unknown }) {
      const markdown = isEnabled()
        ? formatToolMarkdown(name, result, options, context.args)
        : fenced(textFromResult(result) || "<no output>", "text");
      return new Markdown(markdown, 0, 0, theme);
    },
  });
}

function formatToolMarkdown(toolName: string, result: unknown, options: { expanded?: boolean; isPartial?: boolean }, args: unknown) {
  if (options.isPartial) return `### ${toolName}\n\n_Working…_`;
  const text = textFromResult(result).trimEnd();
  const isError = Boolean((result as { isError?: boolean } | undefined)?.isError);
  const title = `${isError ? "❌" : "✅"} ${toolName}`;
  const hint = options.expanded ? "" : "\n\n_Expand for full context when available._";

  if (toolName === "bash") return `${titleLine(title, args)}\n\n${fenced(text || "<no output>", "text")}${hint}`;
  if (toolName === "read") return `${titleLine(title, args)}\n\n${fenced(text || "<empty file>", languageFromArgs(args))}${hint}`;
  return `${titleLine(title, args)}\n\n${fenced(text || "<no output>", "text")}${hint}`;
}

function titleLine(title: string, args: unknown) {
  const summary = summarizeArgs(args);
  return summary ? `### ${title}\n\n\`${summary}\`` : `### ${title}`;
}

function summarizeArgs(args: unknown) {
  if (!args || typeof args !== "object") return "";
  const value = args as Record<string, unknown>;
  const primary = value.command || value.path || value.pattern || value.name || value.action;
  return typeof primary === "string" ? singleLine(primary, 120) : "";
}

function languageFromArgs(args: unknown) {
  if (!args || typeof args !== "object") return "text";
  const path = (args as { path?: unknown }).path;
  if (typeof path !== "string") return "text";
  const ext = path.split(".").pop()?.toLowerCase();
  return (
    (
      {
        ts: "ts",
        js: "js",
        mjs: "js",
        json: "json",
        md: "md",
        css: "css",
        html: "html",
        sh: "bash",
        py: "py",
        rs: "rust",
        go: "go",
      } as Record<string, string>
    )[ext || ""] || "text"
  );
}

function textFromResult(result: unknown) {
  const content = (result as { content?: Array<{ type?: string; text?: string }> } | undefined)?.content;
  return content?.find((block) => block.type === "text")?.text || "";
}

function fenced(text: string, language: string) {
  const safe = text.replace(/```/g, "`\u200b``");
  return `\`\`\`${language}\n${safe}\n\`\`\``;
}

function singleLine(text: string, max: number) {
  const cleaned = text.replace(/[\r\n\t]+/g, " ").trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, Math.max(0, max - 1))}…`;
}
