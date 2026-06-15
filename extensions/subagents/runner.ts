// @ts-nocheck
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createSecretRedactor } from "../secret-redaction/index.ts";
import { allAgents } from "./catalog.ts";
import { execSubagentProcess } from "./executor.ts";
import { writeOutput } from "./output-writer.ts";
import type { AgentDef, ContextMode, RunRecord, SubagentRunOptions } from "./types.ts";

export const DEFAULT_PARENT_CONTEXT_LIMIT = 12_000;

export function buildSubagentPrompt(agentBody: string, task: string, parentContext = "") {
  const parts = [agentBody, "", "Parent task:", task, ""];
  if (parentContext.trim()) {
    parts.push("Parent context handoff (bounded, redacted; use only if relevant):", parentContext.trim(), "");
  }
  parts.push("Output concise findings, changed files if any, validation performed, and risks.");
  return parts.join("\n");
}

export function contextModeForAgent(agent: Partial<AgentDef> = {}, requested?: ContextMode): ContextMode {
  if (requested === "fresh" || requested === "recent") return requested;
  return agent.defaultContext === "fork" ? "recent" : "fresh";
}

export function buildParentContextHandoff(ctx: any, maxChars = DEFAULT_PARENT_CONTEXT_LIMIT) {
  try {
    const sessionContext = ctx?.sessionManager?.buildSessionContext?.();
    const messages = Array.isArray(sessionContext?.messages) ? sessionContext.messages : [];
    const serialized = messages.map(serializeMessageForHandoff).filter(Boolean).join("\n\n");
    const redacted = createSecretRedactor().redactText(serialized);
    return limitContext(redacted, maxChars);
  } catch {
    return "";
  }
}

function serializeMessageForHandoff(message: any) {
  if (!message || typeof message !== "object") return "";
  if (message.role === "user") return `[User]\n${contentToText(message.content)}`.trim();
  if (message.role === "assistant") {
    const text = contentToText(message.content);
    const toolCalls = Array.isArray(message.content)
      ? message.content
          .filter((part) => part?.type === "toolCall")
          .map((part) => part.name)
          .filter(Boolean)
      : [];
    const suffix = toolCalls.length ? `\n[Assistant tool calls] ${toolCalls.join(", ")}` : "";
    return `[Assistant]\n${text}${suffix}`.trim();
  }
  if (message.role === "toolResult") return `[Tool result: ${message.toolName || "tool"}]\n${contentToText(message.content)}`.trim();
  if (message.role === "bashExecution") return `[Bash]\n$ ${message.command || ""}\n${message.output || ""}`.trim();
  if (message.role === "custom") return `[Context: ${message.customType || "custom"}]\n${contentToText(message.content)}`.trim();
  if (message.role === "branchSummary") return `[Branch summary]\n${message.summary || ""}`.trim();
  if (message.role === "compactionSummary") return `[Compaction summary]\n${message.summary || ""}`.trim();
  return "";
}

function contentToText(content: any) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (part?.type === "text") return part.text || "";
      if (part?.type === "thinking") return "[thinking omitted]";
      if (part?.type === "toolCall") return `[tool call: ${part.name || "tool"}]`;
      if (part?.type === "image") return "[image omitted]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function limitContext(text: string, maxChars: number) {
  const trimmed = text.trim();
  const limit = Math.max(0, Math.floor(Number(maxChars) || 0));
  if (!trimmed || !limit || trimmed.length <= limit) return trimmed;
  return `[truncated to last ${limit} chars]\n…${trimmed.slice(-limit)}`;
}

export async function runAgentRecord(
  pi: ExtensionAPI,
  cwd: string,
  name?: string,
  task?: string,
  output?: string | boolean,
  cwdOverride?: string,
  index = 0,
  signal?: AbortSignal,
  onUpdate?: (update: any) => void,
  options: SubagentRunOptions = {},
): Promise<RunRecord> {
  if (!name) throw new Error("subagent run requires agent.");
  if (!task?.trim()) throw new Error("subagent run requires task.");
  const agents = await allAgents(cwd);
  const agent = agents.find((candidate) => candidate.runtimeName === name || candidate.name === name);
  if (!agent) throw new Error(`Unknown subagent '${name}'. Use action=list first.`);
  onUpdate?.({ content: [{ type: "text", text: `Running ${agent.runtimeName}...` }] });

  const redactor = createSecretRedactor();
  const redactedTask = redactor.redactText(task);
  const promptDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
  await fs.chmod(promptDir, 0o700).catch(() => undefined);
  const promptFile = path.join(promptDir, `prompt-${index}.md`);
  const mode = contextModeForAgent(agent, options.contextMode);
  const parentContext =
    mode === "recent"
      ? limitContext(redactor.redactText(options.parentContext || ""), options.parentContextLimit || DEFAULT_PARENT_CONTEXT_LIMIT)
      : "";
  const prompt = redactor.redactText(buildSubagentPrompt(agent.body, redactedTask, parentContext));
  await fs.writeFile(promptFile, prompt, { encoding: "utf8", mode: 0o600, flag: "wx" });

  const runCwd = cwdOverride || cwd;
  try {
    const result = await execSubagentProcess(
      agent.runtimeName,
      redactedTask,
      promptFile,
      runCwd,
      index,
      signal,
      onUpdate,
      undefined,
      redactor.redactText,
    );
    const text = redactor.redactText(result.stdout.trim() || result.stderr.trim());
    const outPath = await writeOutput(runCwd, output, text, index);
    return {
      agent: agent.runtimeName,
      task: redactedTask,
      ok: result.code === 0,
      text,
      error: result.code === 0 ? undefined : `Exited ${result.code}`,
      output: outPath,
      index,
    };
  } catch (error) {
    const message = redactor.redactText(error instanceof Error ? error.message : String(error));
    const outPath = await writeOutput(runCwd, output, message, index);
    return { agent: agent.runtimeName, task: redactedTask, ok: false, text: "", error: message, output: outPath, index };
  } finally {
    await fs.unlink(promptFile).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
    await fs.rmdir(promptDir).catch((error) => {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTEMPTY") throw error;
    });
  }
}
