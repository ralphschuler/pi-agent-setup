// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default function helloTool(pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    if (event.reason === "startup") {
      ctx.ui.setStatus("custom-setup", "custom pi setup loaded");
    }
  });

  pi.registerCommand("hello-setup", {
    description: "Confirm that the custom pi setup is loaded",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Custom pi setup is loaded.", "success");
    },
  });

  pi.registerTool({
    name: "hello_setup",
    label: "Hello Setup",
    description: "Returns a friendly message from the custom pi setup.",
    promptSnippet: "Confirm that this custom pi setup package is installed and active.",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Name to greet" })),
    }),
    async execute(_toolCallId, params) {
      const name = params.name?.trim() || "pi user";
      return {
        content: [{ type: "text", text: `Hello, ${name}! Your custom pi setup is active.` }],
        details: { active: true, name },
      };
    },
  });
}
