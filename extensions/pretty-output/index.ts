// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@mariozechner/pi-coding-agent";
import { createPrettyMarkdown, formatPrettyToolMarkdown } from "../shared/pretty-render.ts";

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
  edit: createEditTool,
  write: createWriteTool,
  grep: createGrepTool,
  find: createFindTool,
  ls: createLsTool,
};

export default function prettyOutput(pi: ExtensionAPI) {
  let enabled = true;
  const registerTool = pi.registerTool.bind(pi);

  pi.registerTool = (definition) => registerTool(withPrettyRenderer(definition, () => enabled));

  for (const [name, factory] of Object.entries(TOOL_FACTORIES)) {
    registerPrettyTool(pi, name, factory, () => enabled);
  }

  pi.registerMessageRenderer(PRETTY_MESSAGE_TYPE, (message) => createPrettyMarkdown(String(message.content || "")));

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

function registerPrettyTool(pi: ExtensionAPI, name: string, factory: (cwd: string) => any, _isEnabled: () => boolean) {
  const base = factory(process.cwd());
  pi.registerTool({
    ...base,
    async execute(toolCallId: string, params: unknown, signal: AbortSignal, onUpdate: unknown, ctx: { cwd: string }) {
      const tool = factory(ctx.cwd || process.cwd());
      return tool.execute(toolCallId, params, signal, onUpdate, ctx);
    },
    renderResult(result: unknown, options: { expanded?: boolean; isPartial?: boolean }, _theme: unknown, context: { args?: unknown }) {
      return createPrettyMarkdown(formatPrettyToolMarkdown(name, result, options, context.args));
    },
  });
}

function withPrettyRenderer(definition: any, _isEnabled: () => boolean) {
  if (definition.renderResult) return definition;
  return {
    ...definition,
    renderResult(result: unknown, options: { expanded?: boolean; isPartial?: boolean }, _theme: unknown, context: { args?: unknown }) {
      return createPrettyMarkdown(formatPrettyToolMarkdown(definition.name, result, options, context.args));
    },
  };
}
