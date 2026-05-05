import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

const OptionSchema = Type.Object({
  label: Type.String({ description: "Short option label shown to the user" }),
  description: Type.Optional(Type.String({ description: "Optional context for the option" })),
});

export default function humanInLoop(pi: ExtensionAPI) {
  pi.registerTool({
    name: "human_in_loop",
    label: "Human In Loop",
    description:
      "Ask the user for clarification or approval with appropriate TUI controls when the agent cannot safely or confidently proceed.",
    promptSnippet: "Ask the human for clarification, approval, free-form input, or option selection via TUI controls.",
    promptGuidelines: [
      "Use human_in_loop when requirements are ambiguous, a decision affects user intent, approval is needed, or proceeding would require guessing.",
      "Prefer select for a small set of clear choices, confirm for yes/no approval, input for short text, and editor for longer structured answers.",
      "Ask concise questions and include enough context for the user to answer without rereading the conversation.",
    ],
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

      const prompt = params.context?.trim() ? `${params.title}\n\n${params.context.trim()}` : params.title;

      if (params.mode === "confirm") {
        const answer = await ctx.ui.confirm(params.title, params.context || "");
        return {
          content: [{ type: "text", text: answer ? "User approved." : "User declined." }],
          details: { mode: params.mode, answer },
        };
      }

      if (params.mode === "select") {
        const options = params.options || [];
        if (options.length < 2) {
          return {
            content: [{ type: "text", text: "human_in_loop select mode requires at least 2 options." }],
            isError: true,
            details: { mode: params.mode, options },
          };
        }

        const labels = options.map((option, index) => {
          const description = option.description?.trim();
          return description ? `${index + 1}. ${option.label} — ${description}` : `${index + 1}. ${option.label}`;
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
