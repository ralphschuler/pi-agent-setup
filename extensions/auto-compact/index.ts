import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";

const DEFAULT_PROVIDER = process.env.PI_AUTO_COMPACT_PROVIDER || "google";
const DEFAULT_MODEL = process.env.PI_AUTO_COMPACT_MODEL || "gemini-2.5-flash";
const MAX_TOKENS = Number(process.env.PI_AUTO_COMPACT_MAX_TOKENS || 8192);
const STATUS_KEY = "auto-compact";

type TextContent = { type: "text"; text: string };

export default function autoCompact(pi: ExtensionAPI) {
  let enabled = process.env.PI_AUTO_COMPACT_ENABLED !== "0";

  pi.on("session_start", async (_event, ctx) => {
    updateStatus(ctx, enabled);
  });

  pi.registerCommand("auto-compact", {
    description: "[on|off|status] — customize auto-compaction into concise gist summaries",
    getArgumentCompletions: (prefix) => {
      const matches = ["on", "off", "status"].filter((value) => value.startsWith(prefix));
      return matches.length ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (action === "on") enabled = true;
      else if (action === "off") enabled = false;
      else if (action !== "status") {
        ctx.ui.notify("Usage: /auto-compact [on|off|status]", "warning");
        return;
      }
      updateStatus(ctx, enabled);
      ctx.ui.notify(`auto-compact ${enabled ? "enabled" : "disabled"} (${DEFAULT_PROVIDER}/${DEFAULT_MODEL})`, "info");
    },
  });

  pi.on("session_before_compact", async (event, ctx) => {
    if (!enabled) return;

    const { preparation, customInstructions, signal } = event;
    const { messagesToSummarize, turnPrefixMessages, previousSummary, fileOps, tokensBefore, firstKeptEntryId } = preparation;
    const messages = [...messagesToSummarize, ...turnPrefixMessages];
    if (messages.length === 0 && !previousSummary) return;

    const model = ctx.modelRegistry.find(DEFAULT_PROVIDER, DEFAULT_MODEL);
    if (!model) {
      ctx.ui.notify(`auto-compact model not found: ${DEFAULT_PROVIDER}/${DEFAULT_MODEL}; using default compaction`, "warning");
      return;
    }

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) {
      ctx.ui.notify(`auto-compact auth unavailable for ${model.provider}; using default compaction`, "warning");
      return;
    }

    const conversationText = serializeConversation(convertToLlm(messages));
    const readFiles = [...(fileOps?.read || [])];
    const modifiedFiles = [...(fileOps?.written || []), ...(fileOps?.edited || [])];
    const prompt = buildGistCompactionPrompt({
      conversationText,
      previousSummary,
      customInstructions,
      readFiles,
      modifiedFiles,
    });

    ctx.ui.notify(`auto-compact: summarizing ${messages.length} messages (${tokensBefore.toLocaleString()} tokens)`, "info");

    try {
      const response = await complete(
        model,
        {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: prompt }],
              timestamp: Date.now(),
            },
          ],
        },
        { apiKey: auth.apiKey, headers: auth.headers, maxTokens: MAX_TOKENS, signal },
      );

      const summary = textFromContent(response.content).trim();
      if (!summary) {
        if (!signal.aborted) ctx.ui.notify("auto-compact produced an empty summary; using default compaction", "warning");
        return;
      }

      return {
        compaction: {
          summary,
          firstKeptEntryId,
          tokensBefore,
          details: {
            mode: "auto-compact-gist",
            provider: model.provider,
            model: model.id,
            readFiles,
            modifiedFiles,
          },
        },
      };
    } catch (error) {
      if (!signal.aborted) ctx.ui.notify(`auto-compact failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
      return;
    }
  });
}

export function buildGistCompactionPrompt(input: {
  conversationText: string;
  previousSummary?: string;
  customInstructions?: string;
  readFiles: string[];
  modifiedFiles: string[];
}) {
  return [
    "You are pi's automated conversation compactor.",
    "Write a compact but complete gist that preserves everything needed to continue the session after old messages are removed.",
    "Do not continue the conversation. Do not invent facts. Prefer concrete file paths, commands, decisions, and current repo state.",
    "",
    "Required format:",
    "## Goal",
    "One short paragraph describing the user's objective.",
    "",
    "## Key Decisions",
    "- Durable decisions, constraints, preferences, and rationale.",
    "",
    "## Progress",
    "### Done",
    "- Completed work and validation.",
    "### In Progress",
    "- Active task, current files, partial edits, failing commands.",
    "### Blocked",
    "- Blockers or none.",
    "",
    "## Critical Context",
    "- Facts needed by the next agent: paths, APIs, env vars, tokens omitted, exact errors, branch/commit state.",
    "",
    "## Next Steps",
    "1. Concrete next action.",
    "",
    "<read-files>",
    ...input.readFiles.map((file) => file),
    "</read-files>",
    "",
    "<modified-files>",
    ...input.modifiedFiles.map((file) => file),
    "</modified-files>",
    input.customInstructions ? `\nUser compaction instructions:\n${input.customInstructions}` : "",
    input.previousSummary ? `\nPrevious summary to preserve/merge:\n${input.previousSummary}` : "",
    `\nConversation to compact:\n<conversation>\n${input.conversationText}\n</conversation>`,
  ]
    .filter((part) => part !== "")
    .join("\n");
}

function textFromContent(content: unknown) {
  return Array.isArray(content)
    ? content
        .filter((item): item is TextContent => Boolean(item) && typeof item === "object" && (item as { type?: unknown }).type === "text")
        .map((item) => item.text)
        .join("\n")
    : "";
}

function updateStatus(ctx: { ui?: { setStatus?: (key: string, value: string | undefined) => void } }, enabled: boolean) {
  ctx.ui?.setStatus?.(STATUS_KEY, enabled ? "🧠 compact gist" : undefined);
}
