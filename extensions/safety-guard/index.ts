import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

const destructiveTargets = new Set(["/", "/*", "/.", "/..", "~", "~/", "$HOME", "${HOME}"]);
const dangerousPatterns = [/\bsudo\s+rm\b/, /\bmkfs(?:\.|\s)/, /\bdd\s+if=.*\sof=\/dev\//];

export default function safetyGuard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const command = commandFromToolCall(event);
    if (!command) return;

    const matched = dangerousReason(command);
    if (!matched) return;

    if (!ctx.hasUI) {
      return { block: true, reason: `Blocked dangerous shell command: ${matched}` };
    }

    const ok = await ctx.ui.confirm("Dangerous command", `Allow this shell command?\n\n${command}`);

    if (!ok) {
      return { block: true, reason: "User rejected dangerous shell command" };
    }
  });
}

export function dangerousReason(command: string) {
  const pattern = dangerousPatterns.find((candidate) => candidate.test(command));
  if (pattern) return String(pattern);
  return hasDangerousRm(command) ? "destructive rm target" : undefined;
}

function hasDangerousRm(command: string) {
  const tokens = shellWords(command);
  for (let i = 0; i < tokens.length; i++) {
    const token = basename(tokens[i]);
    if (token !== "rm") continue;

    let recursive = false;
    let force = false;
    let parsingOptions = true;
    for (let j = i + 1; j < tokens.length; j++) {
      const arg = tokens[j];
      if (parsingOptions && arg === "--") {
        parsingOptions = false;
        continue;
      }
      if (parsingOptions && arg.startsWith("-") && arg !== "-") {
        if (arg.includes("r") || arg.includes("R") || arg === "--recursive") recursive = true;
        if (arg.includes("f") || arg === "--force") force = true;
        continue;
      }
      if (recursive && force && isDangerousRmTarget(arg)) return true;
      if ([";", "&&", "||", "|"].includes(arg)) break;
    }
  }
  return false;
}

function isDangerousRmTarget(target: string) {
  const normalized = target.replace(/\/+$/, "") || "/";
  return destructiveTargets.has(target) || destructiveTargets.has(normalized) || normalized.startsWith("/dev/") || normalized === "/*";
}

function basename(value: string) {
  return value.split("/").pop() || value;
}

function shellWords(command: string) {
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) words.push(current);
      current = "";
      continue;
    }
    if ((ch === "&" || ch === "|") && command[i + 1] === ch) {
      if (current) words.push(current);
      words.push(`${ch}${ch}`);
      current = "";
      i++;
      continue;
    }
    if (ch === ";" || ch === "|") {
      if (current) words.push(current);
      words.push(ch);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) words.push(current);
  return words;
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
