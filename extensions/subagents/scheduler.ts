// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { textResult } from "./result.ts";
import { runAgentRecord } from "./runner.ts";
import type { ParallelTask, RunRecord } from "./types.ts";

export async function runParallel(
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
        records[index] = await runAgentRecord(pi, cwd, task.agent, task.task, task.output, task.cwd, index, signal, onUpdate);
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

export function expandTasks(tasks: ParallelTask[]) {
  const expanded: ParallelTask[] = [];
  for (const task of tasks) {
    const count = Math.max(1, Math.floor(Number(task.count) || 1));
    for (let i = 0; i < count; i++) expanded.push(task);
  }
  return expanded;
}
