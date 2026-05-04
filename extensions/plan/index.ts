import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const PLAN_REVIEW_MARKER = "READY FOR REVIEW";
const PLANNING_TOOLS = new Set(["read", "bash", "grep", "find", "ls", "ask_user_question", "questionnaire", "human_in_loop", "subagent", "todo", "graph_memory"]);

export default function planCommand(pi: ExtensionAPI) {
  let planningActive = false;
  let approvedPlan = "";

  pi.registerCommand("plan", {
    description: "Clarify a task until fully covered, create a reviewed plan, then apply it after approval",
    handler: async (args, ctx) => {
      let task = args.trim();
      if (!task && ctx.hasUI) {
        task = (await ctx.ui.editor("What should we plan?", ""))?.trim() || "";
      }
      if (!task) {
        ctx.ui.notify("Usage: /plan <task>", "warning");
        return;
      }

      planningActive = true;
      approvedPlan = "";
      ctx.ui.setStatus("plan", "planning");
      pi.sendUserMessage(buildKickoffPrompt(task));
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (!planningActive) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n<plan_command>\n${planningInstructions()}\n</plan_command>`,
    };
  });

  pi.on("tool_call", async (event) => {
    if (!planningActive) return;

    if (event.toolName === "edit" || event.toolName === "write") {
      return {
        block: true,
        reason: "The /plan workflow is still in planning/review. File changes are blocked until the user approves the plan.",
      };
    }

    if (!PLANNING_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: `The /plan workflow allows only planning/research tools before approval. Blocked tool: ${event.toolName}`,
      };
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!planningActive || !ctx.hasUI) return;

    const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
    const text = lastAssistant ? getTextContent(lastAssistant) : "";
    if (!text.includes(PLAN_REVIEW_MARKER)) return;

    approvedPlan = text;
    const choice = await ctx.ui.select("Plan ready - what next?", [
      "Apply the plan",
      "Refine the plan",
      "Cancel planning",
    ]);

    if (choice === "Apply the plan") {
      planningActive = false;
      ctx.ui.setStatus("plan", "applying");
      pi.sendUserMessage(`Apply this approved plan now. Follow it step by step, update todo/graph_memory when useful, and report progress.\n\n${approvedPlan}`);
      return;
    }

    if (choice === "Refine the plan") {
      const refinement = await ctx.ui.editor("What should be refined?", "");
      if (refinement?.trim()) {
        pi.sendUserMessage(`Refine the current plan with this feedback, ask more clarifying questions if coverage is no longer complete, then present an updated plan with ${PLAN_REVIEW_MARKER}.\n\nFeedback:\n${refinement.trim()}`);
      }
      return;
    }

    planningActive = false;
    approvedPlan = "";
    ctx.ui.setStatus("plan", undefined);
    ctx.ui.notify("Planning cancelled.", "info");
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!planningActive && ctx.hasUI) ctx.ui.setStatus("plan", undefined);
  });
}

function buildKickoffPrompt(task: string) {
  return `Start the /plan workflow for this task:\n\n${task}\n\nClarify the task until you have complete coverage, then produce a reviewable plan. Do not modify files until I approve the plan.`;
}

function planningInstructions() {
  return [
    "You are in /plan workflow.",
    "Goal: refine the user's task until requirements, constraints, risks, acceptance criteria, files/areas to inspect, and implementation approach have 100% coverage.",
    "Planning rules:",
    "- Do not modify files, write files, or apply changes before user approval.",
    "- Research with read-only tools as needed. You may use subagent for read-only scout/research/review/context-building work before approval, but do not delegate edits until the plan is approved.",
    "- Ask clarifying questions with human_in_loop whenever any requirement, constraint, acceptance criterion, or risk is unknown.",
    "- Prefer concise grouped questions. Continue asking until there are no material unknowns.",
    "- Use todo for durable open planning/application tasks when useful.",
    "- Use graph_memory for durable user preferences, project decisions, and reusable facts when useful.",
    "When coverage is complete, output exactly this structure:",
    "READY FOR REVIEW",
    "Coverage: 100%",
    "Summary: ...",
    "Assumptions: ...",
    "Plan:",
    "1. ...",
    "Validation: ...",
    "Rollback/risks: ...",
    "Do not say READY FOR REVIEW until you are ready for the user to approve or refine the plan.",
  ].join("\n");
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant" && Array.isArray(message.content);
}

function getTextContent(message: AssistantMessage) {
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
