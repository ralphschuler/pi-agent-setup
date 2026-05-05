// @ts-nocheck
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { deleteCustomAgent, readCustomAgents, type AgentScope, writeCustomAgent } from "../custom-agents/registry";

const BUILTIN_AGENTS = [
  {
    name: "scout",
    description: "Read-only codebase reconnaissance. Finds relevant files, APIs, tests, and constraints.",
    prompt: "You are a read-only scout. Inspect files directly, summarize evidence with paths, and do not modify files.",
  },
  {
    name: "planner",
    description: "Breaks a task into an implementation plan with risks, dependencies, and validation steps.",
    prompt: "You are a planner. Produce a concise, ordered plan with assumptions, risks, and validation steps. Do not modify files.",
  },
  {
    name: "reviewer",
    description: "Independent review for bugs, regressions, missing tests, and maintainability risks.",
    prompt: "You are a critical reviewer. Look for concrete issues, cite evidence, and separate must-fix findings from suggestions.",
  },
  {
    name: "worker",
    description: "Focused implementation assistant. Use only when the parent explicitly delegates a bounded task.",
    prompt: "You are a focused implementation worker. Make only requested changes, keep diffs small, and report validation performed.",
  },
  {
    name: "researcher",
    description: "General technical research and synthesis for unfamiliar APIs, designs, or options.",
    prompt: "You are a researcher. Gather relevant context, compare options, cite sources or file paths, and produce a concise synthesis.",
  },
];

type AgentDef = { name: string; runtimeName: string; description?: string; body: string; source: "built-in" | "custom"; scope?: string };
type ParallelTask = { agent: string; task: string; cwd?: string; output?: string | boolean; count?: number };
type RunRecord = { agent: string; task: string; ok: boolean; text: string; output?: string; error?: string; index: number };

export default function subagents(pi: ExtensionAPI) {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: "Custom subagent catalog and runner for focused research, planning, implementation, and review tasks.",
    promptSnippet:
      "Delegate bounded work to built-in or custom specialist agents; supports list, create, delete, single-agent execution, and parallel task arrays.",
    promptGuidelines: [
      "Use subagent action=list before non-trivial delegation to inspect available specialists.",
      "Use subagent tasks for independent bounded research, planning, or review that can run concurrently.",
      "Keep parent responsibility for synthesis and final decisions; verify important child claims directly.",
      "Do not use subagent for simple tasks that can be handled directly.",
    ],
    parameters: Type.Object({
      action: Type.Optional(
        Type.Union([Type.Literal("list"), Type.Literal("create"), Type.Literal("delete"), Type.Literal("run"), Type.Literal("parallel")], {
          description: "Management action. Omit when running an agent or when tasks is provided.",
        }),
      ),
      agent: Type.Optional(Type.String({ description: "Agent runtime name to run/delete." })),
      task: Type.Optional(Type.String({ description: "Task to give the subagent." })),
      tasks: Type.Optional(
        Type.Array(
          Type.Object({
            agent: Type.String({ description: "Agent runtime name." }),
            task: Type.String({ description: "Task for this run." }),
            cwd: Type.Optional(Type.String({ description: "Working directory override." })),
            output: Type.Optional(Type.String({ description: "Optional output file." })),
            count: Type.Optional(Type.Number({ description: "Repeat this task N times." })),
          }),
          { description: "Parallel subagent tasks." },
        ),
      ),
      concurrency: Type.Optional(Type.Number({ description: "Maximum concurrent runs for tasks. Default 4." })),
      config: Type.Optional(Type.String({ description: "JSON config for create." })),
      output: Type.Optional(Type.String({ description: "Optional output file for run." })),
      cwd: Type.Optional(Type.String({ description: "Working directory override." })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      try {
        const action = params.action || (params.tasks ? "parallel" : "run");
        if (action === "list") return await listAgents(ctx.cwd);
        if (action === "create") return await createAgent(ctx.cwd, params.config);
        if (action === "delete") return await deleteAgent(ctx.cwd, params.agent);
        if (action === "parallel") return await runParallel(pi, ctx.cwd, params.tasks || [], params.concurrency, signal, onUpdate);
        const record = await runAgentRecord(pi, ctx.cwd, params.agent, params.task, params.output, params.cwd, 0, signal, onUpdate);
        return textResult(
          record.text || `Subagent ${record.agent} completed with no output.`,
          { action: "run", runs: [record], agent: record.agent },
          !record.ok,
        );
      } catch (error) {
        return textResult(error instanceof Error ? error.message : String(error), { action: "error" }, true);
      }
    },

    renderCall(args, theme) {
      const action = args.action || (args.tasks ? "parallel" : "run");
      const label = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", action);
      if (args.tasks) return new Text(`${label} ${theme.fg("muted", `${args.tasks.length} task(s)`)}`, 0, 0);
      if (args.agent) return new Text(`${label} ${theme.fg("muted", args.agent)}`, 0, 0);
      return new Text(label, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as any;
      if (result.isError) return new Text(theme.fg("error", textFromResult(result)), 0, 0);
      if (!details?.runs) return new Text(textFromResult(result), 0, 0);
      const runs = details.runs as RunRecord[];
      const ok = runs.filter((run) => run.ok).length;
      let text = `${theme.fg(ok === runs.length ? "success" : "warning", `◉ ${ok}/${runs.length} subagent run(s) succeeded`)}`;
      const display = expanded ? runs : runs.slice(0, 6);
      for (const run of display) {
        const mark = run.ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
        const output = run.output ? theme.fg("dim", ` → ${run.output}`) : "";
        text += `\n${mark} ${theme.fg("accent", run.agent)} ${theme.fg("muted", trimLine(run.task, 80))}${output}`;
        if (expanded && (run.error || run.text)) text += `\n  ${theme.fg(run.ok ? "dim" : "error", trimLine(run.error || run.text, 160))}`;
      }
      if (!expanded && runs.length > display.length) text += `\n${theme.fg("dim", `… ${runs.length - display.length} more`)}`;
      return new Text(text, 0, 0);
    },
  });
}

async function allAgents(cwd: string): Promise<AgentDef[]> {
  const builtins = BUILTIN_AGENTS.map((agent) => ({ ...agent, runtimeName: agent.name, body: agent.prompt, source: "built-in" as const }));
  const custom = (await readCustomAgents(cwd)).map((agent) => ({
    name: agent.name,
    runtimeName: agent.runtimeName,
    description: agent.description,
    body: agent.body,
    source: "custom" as const,
    scope: agent.scope,
  }));
  return [...builtins, ...custom].sort((a, b) => a.runtimeName.localeCompare(b.runtimeName));
}

async function listAgents(cwd: string) {
  const agents = await allAgents(cwd);
  const text = agents
    .map(
      (agent) =>
        `- ${agent.runtimeName} (${agent.source}${agent.scope ? `, ${agent.scope}` : ""}) — ${agent.description || "No description"}`,
    )
    .join("\n");
  return textResult(text || "No subagents available.", { action: "list", agents });
}

async function createAgent(cwd: string, config?: string) {
  if (!config) throw new Error("subagent create requires config JSON.");
  const parsed = JSON.parse(config);
  const created = await writeCustomAgent(cwd, {
    name: parsed.name,
    package: parsed.package || "custom",
    description: parsed.description || "Custom subagent.",
    scope: (parsed.scope || "project") as AgentScope,
    systemPrompt:
      parsed.systemPrompt || parsed.prompt || "You are a specialized subagent. Complete the delegated task and report concise results.",
    model: parsed.model,
    thinking: parsed.thinking,
    tools: parsed.tools,
    skills: parsed.skills,
    defaultContext: parsed.defaultContext || "fresh",
    inheritProjectContext: parsed.inheritProjectContext ?? true,
    inheritSkills: parsed.inheritSkills ?? true,
    systemPromptMode: parsed.systemPromptMode || "replace",
  });
  return textResult(`Created ${created.runtimeName}\n${created.path}`, { action: "create", created });
}

async function deleteAgent(cwd: string, agent?: string) {
  if (!agent) throw new Error("subagent delete requires agent.");
  const deleted = await deleteCustomAgent(cwd, agent);
  return textResult(`Deleted ${deleted.runtimeName}\n${deleted.path}`, { action: "delete", deleted });
}

async function runParallel(
  pi: ExtensionAPI,
  cwd: string,
  tasks: ParallelTask[],
  concurrency?: number,
  signal?: AbortSignal,
  onUpdate?: (update: any) => void,
) {
  const expanded = expandTasks(tasks);
  if (expanded.length === 0) throw new Error("subagent parallel requires at least one task.");
  const limit = Math.max(1, Math.min(Number(concurrency) || 4, expanded.length));
  const records: RunRecord[] = new Array(expanded.length);
  let next = 0;
  let completed = 0;

  async function worker() {
    while (next < expanded.length) {
      const index = next++;
      const task = expanded[index];
      onUpdate?.({ content: [{ type: "text", text: `Running subagent ${index + 1}/${expanded.length}: ${task.agent}` }] });
      try {
        records[index] = await runAgentRecord(pi, cwd, task.agent, task.task, task.output, task.cwd, index, signal);
      } catch (error) {
        records[index] = {
          agent: task.agent,
          task: task.task,
          ok: false,
          text: "",
          error: error instanceof Error ? error.message : String(error),
          index,
        };
      }
      completed++;
      onUpdate?.({ content: [{ type: "text", text: `Completed ${completed}/${expanded.length} subagent run(s).` }] });
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  const ok = records.filter((record) => record.ok).length;
  const text = records
    .map((record, i) =>
      [
        `## ${i + 1}. ${record.agent} — ${record.ok ? "ok" : "failed"}`,
        `Task: ${record.task}`,
        record.output ? `Output: ${record.output}` : undefined,
        record.error ? `Error: ${record.error}` : record.text,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");
  return textResult(
    `${ok}/${records.length} subagent run(s) succeeded.\n\n${text}`,
    { action: "parallel", runs: records, concurrency: limit },
    ok !== records.length,
  );
}

function expandTasks(tasks: ParallelTask[]) {
  const expanded: ParallelTask[] = [];
  for (const task of tasks) {
    const count = Math.max(1, Math.floor(Number(task.count) || 1));
    for (let i = 0; i < count; i++) expanded.push(task);
  }
  return expanded;
}

async function runAgentRecord(
  pi: ExtensionAPI,
  cwd: string,
  name?: string,
  task?: string,
  output?: string | boolean,
  cwdOverride?: string,
  index = 0,
  signal?: AbortSignal,
  onUpdate?: (update: any) => void,
): Promise<RunRecord> {
  if (!name) throw new Error("subagent run requires agent.");
  if (!task?.trim()) throw new Error("subagent run requires task.");
  const agents = await allAgents(cwd);
  const agent = agents.find((candidate) => candidate.runtimeName === name || candidate.name === name);
  if (!agent) throw new Error(`Unknown subagent '${name}'. Use action=list first.`);
  onUpdate?.({ content: [{ type: "text", text: `Running ${agent.runtimeName}...` }] });

  const promptFile = path.join(os.tmpdir(), `pi-subagent-${Date.now()}-${process.pid}-${index}.md`);
  const prompt = [
    agent.body,
    "",
    "Parent task:",
    task,
    "",
    "Output concise findings, changed files if any, validation performed, and risks.",
  ].join("\n");
  await fs.writeFile(promptFile, prompt, "utf8");

  const runCwd = cwdOverride || cwd;
  try {
    const result = await pi.exec("bash", ["-lc", `pi -p < ${shellQuote(promptFile)}`], {
      cwd: runCwd,
      signal,
      timeout: 10 * 60 * 1000,
    } as any);
    const text = String((result as any).stdout || (result as any).output || "").trim() || String((result as any).stderr || "").trim();
    const outPath = await writeOutput(runCwd, output, text, index);
    return { agent: agent.runtimeName, task, ok: true, text, output: outPath, index };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const outPath = await writeOutput(runCwd, output, message, index);
    return { agent: agent.runtimeName, task, ok: false, text: "", error: message, output: outPath, index };
  }
}

async function writeOutput(cwd: string, output: string | boolean | undefined, text: string, index: number) {
  if (typeof output !== "string" || !output) return undefined;
  const resolved = output.includes("{index}") ? output.replaceAll("{index}", String(index + 1)) : output;
  const outPath = path.resolve(cwd, resolved);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, text, "utf8");
  return outPath;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function textResult(text: string, details: Record<string, unknown> = {}, isError = false) {
  return { content: [{ type: "text", text }], details, isError };
}

function textFromResult(result: any) {
  const first = result.content?.[0];
  return first?.type === "text" ? first.text : "";
}

function trimLine(text: string, max: number) {
  const flat = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, Math.max(0, max - 1))}…` : flat;
}
