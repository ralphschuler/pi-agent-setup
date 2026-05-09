import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { renderPrettyToolResult } from "../shared/pretty-render.ts";

const OptionSchema = Type.Object({
  label: Type.String({ description: "Short option label shown to the user" }),
  description: Type.Optional(Type.String({ description: "Optional context for the option" })),
});

export const MAX_PROMPT_LINES = 12;
export const MAX_PROMPT_CHARS = 2000;
export const MAX_OPTION_CHARS = 180;

export default function humanInLoop(pi: ExtensionAPI) {
  pi.registerTool({
    name: "human_in_loop",
    label: "Human In Loop",
    description:
      "Ask the user for clarification or approval with appropriate TUI controls when the agent cannot safely or confidently proceed.",
    promptSnippet: "Ask the human for clarification, approval, free-form input, or option selection via TUI controls.",
    promptGuidelines: [
      "Use human_in_loop for every user-facing clarification or approval question; do not ask those questions in plain assistant text.",
      "Use human_in_loop when requirements are ambiguous, a decision affects user intent, approval is needed, or proceeding would require guessing.",
      "Prefer select for a small set of clear choices, confirm for yes/no approval, input for short text, and editor for longer structured answers.",
      "Ask concise questions and include enough context for the user to answer without rereading the conversation.",
      "Include a recommended answer or concise options when that helps the user decide.",
    ],
    renderResult: renderPrettyToolResult("human_in_loop"),
    parameters: Type.Object({
      mode: Type.Union([Type.Literal("select"), Type.Literal("confirm"), Type.Literal("input"), Type.Literal("editor")], {
        description: "The TUI control to use",
      }),
      title: Type.String({ description: "Question or prompt shown to the user" }),
      context: Type.Optional(Type.String({ description: "Additional context displayed above or inside the prompt" })),
      options: Type.Optional(Type.Array(OptionSchema, { description: "Required for mode=select; 2-6 concise choices" })),
      placeholder: Type.Optional(Type.String({ description: "Placeholder or initial text for input/editor" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "Human input unavailable: pi is running without an interactive UI." }],
          isError: true,
          details: { unavailable: true, params },
        };
      }

      const prompt = formatDialogPrompt(params.title, params.context);

      if (params.mode === "confirm") {
        const answer = await ctx.ui.confirm(formatDialogTitle(params.title), formatDialogContext(params.context));
        return {
          content: [{ type: "text", text: answer ? "User approved." : "User declined." }],
          details: { mode: params.mode, answer },
        };
      }

      if (params.mode === "select") {
        const options = params.options || [];
        if (options.length < 2 || options.length > 6) {
          return {
            content: [{ type: "text", text: "human_in_loop select mode requires 2 to 6 options." }],
            isError: true,
            details: { mode: params.mode, options },
          };
        }

        const labels = options.map((option, index) => {
          const description = option.description?.trim();
          return compactSingleLine(
            description ? `${index + 1}. ${option.label} — ${description}` : `${index + 1}. ${option.label}`,
            MAX_OPTION_CHARS,
          );
        });
        const selected = await ctx.ui.select(prompt, labels);
        const index = selected ? labels.indexOf(selected) : -1;
        const option = index >= 0 ? options[index] : undefined;

        return {
          content: [
            {
              type: "text",
              text: option
                ? `User selected: ${option.label}${option.description ? ` — ${option.description}` : ""}`
                : "User cancelled the selection.",
            },
          ],
          details: { mode: params.mode, answer: option?.label ?? null, option, index: index >= 0 ? index : null },
        };
      }

      if (params.mode === "input") {
        const answer = await ctx.ui.input(prompt, params.placeholder || "");
        return {
          content: [{ type: "text", text: answer?.trim() ? `User answered: ${answer.trim()}` : "User provided no answer." }],
          details: { mode: params.mode, answer: answer?.trim() || null },
        };
      }

      const answer = await ctx.ui.editor(prompt, params.placeholder || "");
      return {
        content: [{ type: "text", text: answer?.trim() ? `User answered:\n${answer.trim()}` : "User provided no answer." }],
        details: { mode: params.mode, answer: answer?.trim() || null },
      };
    },
  });
}

export function formatDialogPrompt(title: string, context?: string) {
  const compactTitle = formatDialogTitle(title);
  const compactContext = formatDialogContext(context);
  return compactContext ? `${compactTitle}\n\n${compactContext}` : compactTitle;
}

export function formatDialogTitle(title: string) {
  return compactMultiline(String(title || "").trim() || "Question", 4, 800);
}

export function formatDialogContext(context?: string) {
  const text = String(context || "").trim();
  if (!text) return "";
  return compactMultiline(text, MAX_PROMPT_LINES, MAX_PROMPT_CHARS);
}

export function compactSingleLine(text: string, maxChars = MAX_OPTION_CHARS) {
  const cleaned = String(text || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length <= maxChars ? cleaned : `${cleaned.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function compactMultiline(text: string, maxLines = MAX_PROMPT_LINES, maxChars = MAX_PROMPT_CHARS) {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!normalized) return "";

  const lines = normalized.split("\n");
  const truncatedByLines = lines.length > maxLines;
  let compacted = lines.slice(0, maxLines).join("\n");
  const truncatedByChars = compacted.length > maxChars;

  if (!truncatedByLines && !truncatedByChars) return compacted;
  const omitted = [truncatedByLines ? `${lines.length - maxLines} line(s)` : undefined, truncatedByChars ? "extra text" : undefined]
    .filter(Boolean)
    .join(" and ");
  const suffix = `\n… [truncated ${omitted} to keep the interactive prompt stable]`;
  const contentLimit = Math.max(0, maxChars - suffix.length);
  if (compacted.length > contentLimit) compacted = compacted.slice(0, contentLimit).trimEnd();
  return `${compacted}${suffix}`;
}
