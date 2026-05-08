// @ts-nocheck
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createSecretRedactor } from "../secret-redaction/index.ts";
import { allAgents } from "./catalog.ts";
import { execSubagentProcess } from "./executor.ts";
import { READ_ONLY_SUBAGENT_INSTRUCTIONS } from "./plan-mode.ts";
import { writeOutput } from "./output-writer.ts";
import type { RunRecord } from "./types.ts";

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
  options: { readOnly?: boolean } = {},
): Promise<RunRecord> {
  if (!name) throw new Error("subagent run requires agent.");
  if (!task?.trim()) throw new Error("subagent run requires task.");
  const agents = await allAgents(cwd);
  const agent = agents.find((candidate) => candidate.runtimeName === name || candidate.name === name);
  if (!agent) throw new Error(`Unknown subagent '${name}'. Use action=list first.`);
  onUpdate?.({ content: [{ type: "text", text: `Running ${agent.runtimeName}...` }] });

  const redactor = createSecretRedactor();
  const redactedTask = redactor.redactText(task);
  const promptFile = path.join(os.tmpdir(), `pi-subagent-${Date.now()}-${process.pid}-${index}.md`);
  const prompt = redactor.redactText(
    [
      agent.body,
      "",
      options.readOnly ? READ_ONLY_SUBAGENT_INSTRUCTIONS : undefined,
      options.readOnly ? "" : undefined,
      "Parent task:",
      redactedTask,
      "",
      "Output concise findings, changed files if any, validation performed, and risks.",
    ].join("\n"),
  );
  await fs.writeFile(promptFile, prompt, "utf8");

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
      options.readOnly,
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
  }
}
