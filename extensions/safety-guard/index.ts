import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

const dangerousPatterns = [/\brm\s+-rf\s+\/(?:\s|$)/, /\bsudo\s+rm\b/, /\bmkfs(?:\.|\s)/, /\bdd\s+if=.*\sof=\/dev\//];

export default function safetyGuard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const command = commandFromToolCall(event);
    if (!command) return;

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

function commandFromToolCall(event: unknown) {
  if (isToolCallEventType("bash", event as any)) return (event as { input: { command?: string } }).input.command ?? "";
  if (isProcessStartToolCall(event)) return event.input.command ?? "";
  return "";
}

function isProcessStartToolCall(event: unknown): event is { toolName: "process"; input: { action?: string; command?: string } } {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as { toolName?: unknown }).toolName === "process" &&
    typeof (event as { input?: unknown }).input === "object" &&
    (event as { input?: { action?: unknown } }).input?.action === "start"
  );
}
