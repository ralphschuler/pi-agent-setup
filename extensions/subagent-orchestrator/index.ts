import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { formatSubagentOrchestrationInstructions, readCustomAgents } from "../custom-agents/registry";

export default function subagentOrchestrator(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const customAgents = await readCustomAgents(ctx.cwd);
    return {
      systemPrompt: `${event.systemPrompt}\n\n<subagent_orchestration>\n${instructions()}\n\n<custom_agents>\n${formatSubagentOrchestrationInstructions(customAgents)}\n</custom_agents>\n</subagent_orchestration>`,
    };
  });
}

function instructions() {
  return [
    "Subagents are available as an agent-facing orchestration system through this package's custom subagent tool.",
    "Use subagents proactively for work that benefits from specialist context, independent review, or parallel execution.",
    "For non-trivial delegation, first call subagent with action=list to inspect available agents.",
    "You may dynamically create task-specific subagents with subagent action=create when the built-in roles are too generic.",
    "Dynamic subagent creation guidance:",
    "- Create narrow, task-specific agents with clear names, descriptions, system prompts, tool limits, success criteria, escalation rules, and output contracts.",
    "- Prefer package names like custom, dynamic, project, research, review, or implementation so generated agents are grouped and discoverable.",
    "- Set defaultContext=fresh for independent research/review; use fork only when inherited conversation context is required.",
    "- Set inheritProjectContext=true for codebase tasks and inheritSkills=true when specialized skills help.",
    "- Disable or delete obsolete generated agents when they are no longer useful.",
    "Parallel delegation guidance:",
    "- Use subagent tasks[] for bounded independent work such as codebase reconnaissance, research, test investigation, or adversarial review.",
    "- Set concurrency to a modest number; default is 4.",
    "- Avoid concurrent writes to the same files. Use review/research/scout agents for read-only work and a single worker for edits.",
    "- Give each delegated task a distinct scope and output path when artifacts are useful; use {index} in output paths for repeated tasks.",
    "Parent orchestration rules:",
    "- The parent agent remains responsible for synthesis, user-facing decisions, and final quality.",
    "- Child subagents should receive concrete role-specific tasks and should not spawn their own subagents.",
    "- Ask the human via human_in_loop before launching high-cost, risky, or broad parallel work if the intended scope is unclear.",
  ].join("\n");
}
