import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";

const PLAN_REVIEW_MARKER = "READY FOR REVIEW";
const PLANNING_TOOLS = new Set([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  "ask_user_question",
  "questionnaire",
  "human_in_loop",
  "subagent",
  "todo",
  "graph_memory",
]);

export default function planCommand(pi: ExtensionAPI) {
  let planningActive = false;
  let approvedPlan = "";
  let currentCtx: ExtensionContext | undefined;

  function startPlanning(task: string, ctx?: ExtensionContext) {
    planningActive = true;
    approvedPlan = "";
    ctx?.ui.setStatus("plan", "planning");
    const prompt = buildKickoffPrompt(task);
    if (ctx?.isIdle?.() === false) pi.sendUserMessage(prompt, { deliverAs: "followUp" });
    else pi.sendUserMessage(prompt);
  }

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
  });

  pi.events.on("plan:start", (data) => {
    const task = typeof data === "string" ? data : (data as { task?: string } | undefined)?.task;
    if (!task?.trim()) {
      currentCtx?.ui.notify("plan:start ignored: missing task", "warning");
      return;
    }
    startPlanning(task.trim(), currentCtx);
  });

  pi.registerCommand("plan", {
    description: "<task> — clarify a task, create a reviewed plan, then apply it after approval",
    handler: async (args, ctx) => {
      let task = args.trim();
      if (!task && ctx.hasUI) {
        task = (await ctx.ui.editor("What should we plan?", ""))?.trim() || "";
      }
      if (!task) {
        ctx.ui.notify("Usage: /plan <task>", "warning");
        return;
      }

      startPlanning(task, ctx);
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
    const prdExists = fs.existsSync(path.join(ctx.cwd || process.cwd(), "PRD.md"));
    const prdChoice = prdExists ? "Update PRD.md" : "Write PRD.md";
    const choice = await ctx.ui.select("Plan ready - what next?", ["Apply the plan", "Change the plan", prdChoice, "Cancel planning"]);

    if (choice === "Apply the plan") {
      planningActive = false;
      ctx.ui.setStatus("plan", "applying");
      pi.sendUserMessage(
        `Apply this approved plan now. Follow it step by step, update todo/graph_memory when useful, and report progress.\n\n${approvedPlan}`,
      );
      return;
    }

    if (choice === "Change the plan") {
      const refinement = await ctx.ui.editor("What should be changed?", "");
      if (refinement?.trim()) {
        pi.sendUserMessage(
          `Refine the current plan with this feedback, ask more clarifying questions if coverage is no longer complete, then present an updated plan with ${PLAN_REVIEW_MARKER}.\n\nFeedback:\n${refinement.trim()}`,
        );
      }
      return;
    }

    if (choice === prdChoice) {
      planningActive = false;
      ctx.ui.setStatus("plan", "writing PRD.md");
      pi.sendUserMessage(
        `Convert this approved plan into a clear product requirements document at PRD.md. Do not implement the plan. Create or update PRD.md only. Synthesize from the approved plan and already-known conversation/codebase context; do not re-interview the user unless a blocking contradiction makes the PRD unsafe. If needed, inspect CONTEXT.md, docs/adr/, repo docs, and current code first so the PRD uses project domain vocabulary and respects existing decisions. Actively identify major modules to build or modify, opportunities for deep modules with small stable testable interfaces, and which modules need behavior-focused tests.\n\nUse this PRD structure exactly:\n\n## Problem Statement\n\nState the user-facing problem from the user's perspective.\n\n## Solution\n\nState the user-facing solution.\n\n## User Stories\n\nProvide an extensive numbered list in the form: As an <actor>, I want a <feature>, so that <benefit>.\n\n## Implementation Decisions\n\nList durable decisions: modules to build/modify, interface changes, technical clarifications, architecture, schema/API contracts, and specific interactions. Avoid volatile file paths and code snippets unless a prototype snippet captures a decision more precisely than prose; if included, trim it to decision-rich parts and label it prototype-derived.\n\n## Testing Decisions\n\nDescribe behavior-focused testing standards, which modules/interfaces need tests, and prior-art tests or patterns in the codebase. Prefer external behavior over implementation details.\n\n## Feature Phases\n\nStructure the PRD into small feature phases. Each phase must be independently and quickly testable with concrete validation commands/checks, acceptance criteria, and rollback/stop points where practical.\n\n## Out of Scope\n\nList explicit non-goals.\n\n## Further Notes\n\nCapture open questions, risks, rollout notes, issue-tracker follow-up, and anything useful for future agents.\n\n${approvedPlan}`,
      );
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
  return `Start the /plan workflow for this task:\n\n${task}\n\nRun deep drilldown planning before implementation. Walk the decision tree one branch at a time, inspect the codebase for answers when possible, ask only necessary user questions, and include your recommended answer for every question. Do not modify files until I approve the plan.`;
}

function planningInstructions() {
  return [
    "You are in /plan workflow: a deep drilldown planning mode inspired by a relentless design interview.",
    "Goal: reach shared understanding before implementation by resolving every material branch of the decision tree: requirements, constraints, architecture, UX/API behavior, state/data, failure modes, security, tests, deployment, rollback, and acceptance criteria.",
    "Core rules:",
    "- Do not modify files, write files, or apply changes before user approval.",
    "- Ask every user-facing clarification or approval question with the human_in_loop tool; do not ask those questions in plain assistant text.",
    "- Ask questions one at a time when user input is required. Do not dump a long questionnaire unless the UI specifically supports it and it reduces back-and-forth.",
    "- For every question, include your recommended answer and why. Format: Question / Recommended answer / Why it matters.",
    "- If a question can be answered by inspecting the repo, docs, config, tests, or current state, inspect first instead of asking the user.",
    "- Walk dependencies between decisions one-by-one. Resolve upstream decisions before downstream implementation details.",
    "- Continue drilling until there are no material unknowns, not merely until a plausible plan exists.",
    "- Research with read-only tools as needed. You may use subagent for read-only scout/research/review/context-building work before approval, but do not delegate edits until the plan is approved.",
    "- Use todo for durable planning/application tasks when useful.",
    "- Use graph_memory for durable user preferences, project decisions, and reusable facts when useful.",
    "Deep drilldown phases:",
    "1. Frame the objective: restate goal, success criteria, non-goals, user-visible impact, and affected surfaces.",
    "2. Reconnaissance: inspect relevant files, docs, tests, CI/config, runtime assumptions, and prior decisions before asking anything discoverable.",
    "3. Decision tree: identify branches and dependencies. For each unresolved branch, ask exactly one targeted question with human_in_loop and a recommended answer.",
    "4. Risk sweep: enumerate correctness, security, privacy, data loss, performance, migration, compatibility, UX, and operational risks; resolve each by evidence or question.",
    "5. Plan synthesis: produce an implementation plan split into small feature phases. Each phase must be independently and quickly testable with concrete validation commands/checks, acceptance criteria, and rollback/stop points where practical.",
    "6. Review gate: only after coverage is complete, present the plan for approval using the exact READY FOR REVIEW structure.",
    "Coverage checklist before READY FOR REVIEW:",
    "- Goal and non-goals are explicit.",
    "- All user preferences and constraints are captured.",
    "- Affected files/modules/APIs/UI/config/tests are identified.",
    "- Alternatives and rejected approaches are noted when meaningful.",
    "- Security, error handling, edge cases, observability, and rollback are addressed.",
    "- The plan is split into feature phases that can be implemented and validated independently.",
    "- Each phase has quick validation commands/checks and test cases that are concrete.",
    "- Broad, untestable phases are split into smaller slices unless a clear constraint prevents it.",
    "- Remaining assumptions are either confirmed by the user or clearly low-risk.",
    "When coverage is complete, output exactly this structure:",
    "READY FOR REVIEW",
    "Coverage: 100%",
    "Summary: ...",
    "Decisions resolved: ...",
    "Assumptions: ...",
    "Non-goals: ...",
    "PRD-ready summary:",
    "- Problem Statement: ...",
    "- Solution: ...",
    "- User Stories: ...",
    "- Implementation Decisions: ...",
    "- Testing Decisions: ...",
    "- Out of Scope: ...",
    "Plan:",
    "Phase 1: <small feature slice>",
    "- Goal: ...",
    "- Files/areas: ...",
    "- Acceptance criteria: ...",
    "- Quick validation: ...",
    "- Rollback/stop point: ...",
    "Phase 2: <next independently testable slice>",
    "- Goal: ...",
    "- Files/areas: ...",
    "- Acceptance criteria: ...",
    "- Quick validation: ...",
    "- Rollback/stop point: ...",
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
