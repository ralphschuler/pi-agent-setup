// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { createAgent, deleteAgent, listAgents } from "./catalog.ts";
import { renderSubagentCall, renderSubagentResult } from "./renderer.ts";
import { buildParentContextHandoff, runAgentRecord } from "./runner.ts";
import { runParallel } from "./scheduler.ts";
import { textResult } from "./result.ts";

export default function subagents(pi: ExtensionAPI) {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: "Custom subagent catalog and runner for focused research, planning, implementation, and review tasks.",
    promptSnippet:
      "Delegate bounded work to built-in or custom specialist agents; supports list, create, delete, single-agent execution, and parallel task arrays.",
    promptGuidelines: [
      "Use subagent action=list before non-trivial delegation to inspect available specialists.",
      "Create a narrow custom specialist with subagent action=create when no matching specialist exists.",
      "When creating custom specialists, include description, tool limits, success criteria, escalation rules, and output contract.",
      "Use subagent tasks for independent bounded research, planning, or review that can run concurrently.",
      'Use subagent contextMode="fresh" by default; use contextMode="recent" only for a bounded redacted parent-context handoff when inherited context is required.',
      "Keep only the child agent's synthesized summary/result in parent context instead of copying raw conversation history.",
      "Keep parent responsibility for synthesis, verification, and final decisions; verify important child claims directly.",
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
            contextMode: Type.Optional(
              Type.Union([Type.Literal("fresh"), Type.Literal("recent")], {
                description:
                  "Context handoff mode. fresh is isolated; recent sends a bounded redacted parent-context handoff to the child prompt.",
              }),
            ),
          }),
          { description: "Parallel subagent tasks." },
        ),
      ),
      concurrency: Type.Optional(Type.Number({ description: "Maximum concurrent runs for tasks. Default 4." })),
      contextMode: Type.Optional(
        Type.Union([Type.Literal("fresh"), Type.Literal("recent")], {
          description:
            "Context handoff mode. fresh is isolated; recent sends a bounded redacted parent-context handoff to the child prompt.",
        }),
      ),
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
        if (action === "parallel")
          return await runParallel(pi, ctx, ctx.cwd, params.tasks || [], params.concurrency, params.contextMode, signal, onUpdate);
        const record = await runAgentRecord(pi, ctx.cwd, params.agent, params.task, params.output, params.cwd, 0, signal, onUpdate, {
          contextMode: params.contextMode,
          parentContext: buildParentContextHandoff(ctx),
        });
        return textResult(
          record.text || `Subagent ${record.agent} completed with no output.`,
          { action: "run", runs: [record], agent: record.agent },
          !record.ok,
        );
      } catch (error) {
        return textResult(error instanceof Error ? error.message : String(error), { action: "error" }, true);
      }
    },

    renderCall: renderSubagentCall,
    renderResult: renderSubagentResult,
  });
}
