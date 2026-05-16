import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";

const DEFAULT_MAX_ITERATIONS = 5;
const HARD_MAX_ITERATIONS = 20;
const STATUS_RE = /^\s*LOOP STATUS:\s*(done|continue)\s*$/gim;
const SUMMARY_RE = /^\s*LOOP SUMMARY:\s*([\s\S]*)$/im;

type LoopState = {
  active: boolean;
  freeform: string;
  maxIterations: number;
  iteration: number;
  parentSession?: string;
  lastSummary?: string;
};

type LoopRuntime = {
  commandCtx?: ExtensionCommandContext;
};

const loopRuntime: LoopRuntime = {};

export type LoopStatus = "done" | "continue";

export type ParsedLoopResult = {
  status?: LoopStatus;
  summary?: string;
};

export default function loopExtension(pi: ExtensionAPI) {
  let state: LoopState | undefined;
  pi.on("session_start", async () => {
    // Loop state lives in module scope so session replacement can continue the workflow.
  });

  pi.registerCommand("loop", {
    description: "<freeform instructions> — repeat agent work in fresh sessions until done or max iterations",
    handler: async (args, ctx) => {
      loopRuntime.commandCtx = ctx;
      const freeform = await resolveFreeformInput(args, ctx);
      if (!freeform) {
        ctx.ui.notify("Usage: /loop <freeform instructions, goal, and optional max count>", "warning");
        return;
      }

      const maxIterations = extractMaxIterations(freeform);
      state = {
        active: true,
        freeform,
        maxIterations,
        iteration: 1,
        parentSession: ctx.sessionManager.getSessionFile() || undefined,
      };

      ctx.ui.notify(`Starting /loop iteration 1/${maxIterations}.`, "info");
      pi.sendUserMessage(buildLoopPrompt(state));
    },
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!state?.active) return;
    const loopCtx = loopRuntime.commandCtx;
    if (!loopCtx) {
      ctx.ui.notify("/loop stopped: no command-capable session context is available.", "warning");
      state = undefined;
      return;
    }

    const text = getLastAssistantText(event.messages);
    const parsed = parseLoopResult(text);

    if (!parsed.status) {
      stopLoop(state, ctx, "missing LOOP STATUS marker");
      state = undefined;
      return;
    }

    if (parsed.status === "done") {
      stopLoop(state, ctx, `done after iteration ${state.iteration}`);
      state = undefined;
      return;
    }

    if (!parsed.summary) {
      stopLoop(state, ctx, "missing LOOP SUMMARY marker for continue status");
      state = undefined;
      return;
    }

    if (state.iteration >= state.maxIterations) {
      stopLoop(state, ctx, `max iterations reached (${state.maxIterations})`);
      state = undefined;
      return;
    }

    const nextState: LoopState = {
      ...state,
      iteration: state.iteration + 1,
      lastSummary: parsed.summary,
      parentSession: ctx.sessionManager.getSessionFile() || state.parentSession,
    };
    state = nextState;

    const result = await loopCtx.newSession({
      parentSession: nextState.parentSession,
      setup: async (sessionManager: any) => {
        sessionManager.appendMessage({
          role: "user",
          content: [
            {
              type: "text",
              text: buildLoopSessionSetup(nextState),
            },
          ],
          timestamp: Date.now(),
        });
      },
      withSession: async (replacementCtx: any) => {
        loopRuntime.commandCtx = replacementCtx;
        await replacementCtx.sendUserMessage(buildLoopPrompt(nextState));
      },
    });

    if (result?.cancelled) {
      ctx.ui.notify("/loop stopped: new session was cancelled.", "warning");
      state = undefined;
    }
  });

  pi.on("session_shutdown", async () => {
    // Do not clear loopRuntime here; withSession needs to bridge replacement sessions.
  });
}

async function resolveFreeformInput(args: string, ctx: ExtensionCommandContext) {
  const trimmed = args.trim();
  if (trimmed) return trimmed;
  if (!ctx.hasUI) return "";
  return (await ctx.ui.editor("Freeform /loop instructions", ""))?.trim() || "";
}

export function extractMaxIterations(input: string) {
  const patterns = [
    /(?:--max|max(?:imum)?|up to|at most|no more than)\s*[:=]?\s*(\d{1,3})\b/i,
    /\b(\d{1,3})\s*(?:x|times|iterations?|repetitions?|loops?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return clampIterations(Number(match[1]));
  }

  return DEFAULT_MAX_ITERATIONS;
}

function clampIterations(value: number) {
  if (!Number.isFinite(value) || value < 1) return DEFAULT_MAX_ITERATIONS;
  return Math.min(Math.floor(value), HARD_MAX_ITERATIONS);
}

export function parseLoopResult(text: string): ParsedLoopResult {
  STATUS_RE.lastIndex = 0;
  const statusMatches = [...text.matchAll(STATUS_RE)];
  const status = statusMatches.length ? (statusMatches[statusMatches.length - 1][1].toLowerCase() as LoopStatus) : undefined;
  const summaryMatch = text.match(SUMMARY_RE);
  const summary = summaryMatch?.[1]?.trim();
  const result: ParsedLoopResult = {};
  if (status) result.status = status;
  if (summary) result.summary = summary;
  return result;
}

export function buildLoopPrompt(state: Pick<LoopState, "freeform" | "iteration" | "maxIterations" | "lastSummary">) {
  return [
    `Run /loop iteration ${state.iteration}/${state.maxIterations}.`,
    "",
    "Original freeform loop request:",
    state.freeform,
    "",
    state.lastSummary ? `Previous iteration summary:\n${state.lastSummary}\n` : "This is the first iteration.",
    "Loop rules:",
    "- Work toward the goal implied by the freeform request.",
    "- Stop when the goal is met, when further progress needs user input, or when continuing would be unsafe.",
    "- Use normal tool, safety, and human_in_loop rules.",
    "- End your response with exactly these markers:",
    "  LOOP STATUS: done|continue",
    "  LOOP SUMMARY: compact handoff for the next fresh session",
    "- Use LOOP STATUS: continue only when another iteration should run without user input.",
  ].join("\n");
}

export function buildLoopSessionSetup(state: Pick<LoopState, "freeform" | "iteration" | "maxIterations" | "lastSummary">) {
  return [
    "You are continuing a bounded /loop workflow in a fresh session.",
    `Iteration: ${state.iteration}/${state.maxIterations}`,
    "Original freeform loop request:",
    state.freeform,
    "",
    "Prior iteration compact summary:",
    state.lastSummary || "(none)",
  ].join("\n");
}

function stopLoop(state: LoopState, ctx: ExtensionContext | ExtensionCommandContext, reason: string) {
  state.active = false;
  ctx.ui.notify(`/loop stopped: ${reason}.`, reason.startsWith("done") ? "info" : "warning");
}

function getLastAssistantText(messages: AgentMessage[]) {
  const lastAssistant = [...messages].reverse().find(isAssistantMessage);
  if (!lastAssistant) return "";
  return getTextContent(lastAssistant);
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant";
}

function getTextContent(message: AssistantMessage) {
  return message.content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
