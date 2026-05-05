import fs from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

const AUDIT_LOG_PATH = join(homedir(), ".pi", "agent", "policy-guard-audit.log");
const destructiveTargets = new Set(["/", "/*", "/.", "/..", "~", "~/", "$HOME", "${HOME}"]);
const dangerousPatterns = [/\bsudo\s+rm\b/, /\bmkfs(?:\.|\s)/, /\bdd\s+if=.*\sof=\/dev\//];

export type PolicyDecision = {
  action: "allow" | "confirm" | "block";
  reason: string;
  category: string;
};

export type PolicyRule = {
  category: string;
  action: "confirm" | "block";
  test: (event: unknown) => string | undefined;
};

export const policyRules: PolicyRule[] = [
  {
    category: "dangerous-shell",
    action: "confirm",
    test: (event) => {
      const command = commandFromToolCall(event);
      const reason = command ? dangerousReason(command) : undefined;
      return reason ? `dangerous shell command: ${reason}` : undefined;
    },
  },
  {
    category: "package-install",
    action: "confirm",
    test: (event) => {
      const command = commandFromToolCall(event);
      return command && isPackageInstallCommand(command) ? "package install command requires approval" : undefined;
    },
  },
  {
    category: "network-exposure",
    action: "confirm",
    test: (event) => {
      const command = commandFromToolCall(event);
      return command && exposesNetwork(command) ? "command may expose a service beyond localhost" : undefined;
    },
  },
  {
    category: "protected-path",
    action: "block",
    test: (event) => (touchesProtectedPath(event) ? "protected path is blocked" : undefined),
  },
];

export default function safetyGuard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const decision = evaluatePolicy(event);
    if (decision.action === "allow") return;

    if (decision.action === "block" || !ctx.hasUI) {
      await auditPolicyDecision(event, decision, false);
      return { block: true, reason: policyBlockReason(decision) };
    }

    const ok = await ctx.ui.confirm("Policy guard approval", `${decision.reason}\n\nAllow this action?\n\n${summarizeToolCall(event)}`);
    await auditPolicyDecision(event, decision, ok);

    if (!ok) return { block: true, reason: `User rejected ${decision.category}` };
  });
}

export function evaluatePolicy(event: unknown): PolicyDecision {
  for (const rule of policyRules) {
    const reason = rule.test(event);
    if (reason) return { action: rule.action, reason, category: rule.category };
  }
  return { action: "allow", reason: "no policy matched", category: "none" };
}

export function dangerousReason(command: string) {
  const pattern = dangerousPatterns.find((candidate) => candidate.test(command));
  if (pattern) return String(pattern);
  return hasDangerousRm(command) ? "destructive rm target" : undefined;
}

export function isPackageInstallCommand(command: string) {
  return /\b(npm|pnpm|yarn|bun)\s+(?:add|install|i)\b/.test(command) || /\bpip(?:3)?\s+install\b/.test(command);
}

export function exposesNetwork(command: string) {
  return /(--host\s+0\.0\.0\.0|--host=0\.0\.0\.0|--listen\s+0\.0\.0\.0|--listen=0\.0\.0\.0|\b0\.0\.0\.0:)\b/.test(command);
}

export function touchesProtectedPath(event: unknown) {
  const text = JSON.stringify((event as { input?: unknown })?.input || {});
  return /("path"\s*:\s*"(?:\/etc|\/var|\/usr|\/bin|\/sbin|\/boot|\/dev|\/proc|\/sys)\b|"path"\s*:\s*"(?:~\/\.ssh|\$HOME\/\.ssh))/.test(
    text,
  );
}

async function auditPolicyDecision(event: unknown, decision: PolicyDecision, approved: boolean) {
  const record = {
    timestamp: new Date().toISOString(),
    toolName: (event as { toolName?: unknown })?.toolName || "unknown",
    category: decision.category,
    action: decision.action,
    reason: decision.reason,
    approved,
  };
  try {
    await fs.mkdir(join(homedir(), ".pi", "agent"), { recursive: true });
    await fs.appendFile(AUDIT_LOG_PATH, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // Audit logging must not break safety decisions.
  }
}

function policyBlockReason(decision: PolicyDecision) {
  if (decision.category === "dangerous-shell") return `Blocked dangerous shell command pending approval: ${decision.reason}`;
  return decision.action === "block" ? `Blocked by policy guard: ${decision.reason}` : `Blocked pending approval: ${decision.reason}`;
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

function summarizeToolCall(event: unknown) {
  const toolName = (event as { toolName?: unknown })?.toolName || "unknown";
  const input = JSON.stringify((event as { input?: unknown })?.input || {}, null, 2).slice(0, 1200);
  return `${toolName}\n${input}`;
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
