import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

const dangerousPatterns = [/\brm\s+-rf\s+\/(?:\s|$)/, /\bsudo\s+rm\b/, /\bmkfs(?:\.|\s)/, /\bdd\s+if=.*\sof=\/dev\//];

export default function safetyGuard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command ?? "";
    const matched = dangerousPatterns.find((pattern) => pattern.test(command));
    if (!matched) return;

    if (!ctx.hasUI) {
      return { block: true, reason: `Blocked dangerous shell command matching ${matched}` };
    }

    const ok = await ctx.ui.confirm("Dangerous command", `Allow this shell command?\n\n${command}`);

    if (!ok) {
      return { block: true, reason: "User rejected dangerous shell command" };
    }
  });
}
