import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function subagentOrchestrator(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n\n<subagent_orchestration>\n${instructions()}\n</subagent_orchestration>`,
    };
  });
}

function instructions() {
  return [
    "Subagents are available as an agent-facing orchestration system through the subagent tool when the pi-subagents package is loaded.",
    "Use subagents proactively for work that benefits from specialist context, independent review, or parallel execution.",
    "For non-trivial delegation, first call subagent with action=list to inspect available agents/chains.",
    "You may dynamically create task-specific subagents with subagent action=create when the built-in roles are too generic.",
    "Dynamic subagent creation guidance:",
    "- Create narrow, task-specific agents with clear names, descriptions, system prompts, tool limits, and success criteria.",
    "- Prefer package names like dynamic, project, research, review, or implementation so generated agents are grouped and discoverable.",
    "- Set defaultContext=fresh for independent research/review; use fork only when inherited conversation context is required.",
    "- Set inheritProjectContext=true for codebase tasks and inheritSkills=true when specialized skills help.",
    "- Disable or delete obsolete generated agents when they are no longer useful.",
    "Parallel execution guidance:",
    "- Use subagent tasks[] for independent work that can run concurrently, such as codebase reconnaissance, research, test investigation, or adversarial reviews.",
    "- Use chain[] when one step must consume another step's output; chain steps can contain parallel groups.",
    "- Avoid concurrent writes to the same files. Use review/research/scout agents for parallel read-only work and a single worker for edits.",
    "- Use worktree=true only when parallel workers must make isolated filesystem changes.",
    "- Give each parallel task a distinct scope and output path when artifacts are useful.",
    "Parent orchestration rules:",
    "- The parent agent remains responsible for synthesis, user-facing decisions, and final quality.",
    "- Child subagents should receive concrete role-specific tasks and should not spawn their own subagents.",
    "- Ask the human via human_in_loop before launching high-cost, risky, or broad parallel work if the intended scope is unclear.",
  ].join("\n");
}
