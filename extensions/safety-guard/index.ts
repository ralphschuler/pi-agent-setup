import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { appendPrivateFile, withPrivateFileLock } from "../shared/private-storage.ts";
import { dangerousShellReason, exposesNetwork, isPackageInstallCommand, isProtectedSystemPath } from "../shared/safety.ts";

const AUDIT_LOG_PATH = join(homedir(), ".pi", "agent", "policy-guard-audit.log");
export { exposesNetwork, isPackageInstallCommand };
export const dangerousReason = dangerousShellReason;

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

export function touchesProtectedPath(event: unknown) {
  return collectStringValues((event as { input?: unknown })?.input).some(isProtectedSystemPath);
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
    await withPrivateFileLock(AUDIT_LOG_PATH, () => appendPrivateFile(AUDIT_LOG_PATH, `${JSON.stringify(record)}\n`));
  } catch {
    // Audit logging must not break safety decisions.
  }
}

function policyBlockReason(decision: PolicyDecision) {
  if (decision.category === "dangerous-shell") return `Blocked dangerous shell command pending approval: ${decision.reason}`;
  return decision.action === "block" ? `Blocked by policy guard: ${decision.reason}` : `Blocked pending approval: ${decision.reason}`;
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  return Object.values(value).flatMap(collectStringValues);
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
