import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";

export const MAX_LOOP_SENDS = 50;
export const LOOP_IDLE_RETRY_MS = 25;
export const LOOP_NEXT_ITERATION_DELAY_MS = 5_000;
export const LOOP_USAGE = "Usage: /loop [prompt] | /loop start [prompt] | /loop stop | /loop status | /loop help";

export type LoopParsedArgs = { action: "start"; prompt?: string } | { action: "stop" } | { action: "status" } | { action: "help" };

type LoopState = {
  active: boolean;
  prompt: string;
  sent: number;
  pendingSend: boolean;
};

type LoopProcessState = {
  state: LoopState;
  controlCtx?: LoopControlCtx;
  scheduledSend?: ReturnType<typeof setTimeout>;
  preserveNextNewSession: boolean;
  preservedTargetSessionFile?: string;
};

export type LoopExtensionOptions = {
  idleRetryMs?: number;
  nextIterationDelayMs?: number;
  stateKey?: PropertyKey;
};

type LoopCtx = Partial<ExtensionContext> & {
  hasUI?: boolean;
  isIdle?: () => boolean;
  ui?: {
    editor?: (title: string, placeholder?: string) => Promise<string | undefined>;
    notify?: (message: string, level: "info" | "warning" | "error" | "success") => void;
    setStatus?: (name: string, value: string | undefined) => void;
  };
};

type LoopReplacementCtx = LoopCtx & {
  sendUserMessage?: (content: string, options?: { deliverAs?: "steer" | "followUp" }) => Promise<void>;
};

type LoopControlCtx = LoopCtx &
  Partial<Omit<ExtensionCommandContext, "newSession">> & {
    newSession?: (options?: {
      parentSession?: string;
      withSession?: (ctx: LoopReplacementCtx & LoopControlCtx) => Promise<void>;
    }) => Promise<{ cancelled: boolean }>;
    sendUserMessage?: (content: string, options?: { deliverAs?: "steer" | "followUp" }) => Promise<void>;
  };

const DEFAULT_LOOP_STATE_KEY = Symbol.for("pi.loopExtension.defaultState");
const LOOP_STATE_STORE_PROPERTY = "__piLoopExtensionStateStore";

// Pi recreates extension instances during session replacement. Keep only the
// active loop data in process memory so loop-created sessions can continue;
// shutdown handlers still clear it for reload, manual switches, and exit.

export default function loopExtension(pi: ExtensionAPI, options: LoopExtensionOptions = {}) {
  const idleRetryMs = options.idleRetryMs ?? LOOP_IDLE_RETRY_MS;
  const nextIterationDelayMs = options.nextIterationDelayMs ?? LOOP_NEXT_ITERATION_DELAY_MS;
  const processState = getLoopProcessState(options.stateKey ?? DEFAULT_LOOP_STATE_KEY);

  function notify(ctx: LoopCtx | undefined, message: string, level: "info" | "warning" | "error" = "info") {
    ctx?.ui?.notify?.(message, level);
  }

  function updateStatus(ctx: LoopCtx | undefined) {
    if (!ctx?.hasUI) return;
    const state = processState.state;
    ctx.ui?.setStatus?.("loop", state.active ? `loop: ${state.sent}/${MAX_LOOP_SENDS}` : undefined);
  }

  function clearScheduledSend() {
    if (processState.scheduledSend) clearTimeout(processState.scheduledSend);
    processState.scheduledSend = undefined;
  }

  function reset(ctx: LoopCtx | undefined) {
    clearScheduledSend();
    processState.state = createInactiveState();
    processState.controlCtx = undefined;
    processState.preserveNextNewSession = false;
    processState.preservedTargetSessionFile = undefined;
    updateStatus(ctx);
  }

  function stopLoop(ctx: LoopCtx | undefined, message?: string, level: "info" | "warning" | "error" = "info") {
    reset(ctx);
    if (message) notify(ctx, message, level);
  }

  function sendNextWhenIdle(ctx: LoopCtx | undefined) {
    if (!processState.state.active || processState.scheduledSend) return;
    processState.state.pendingSend = true;
    updateStatus(ctx);
    scheduleSendWhenIdle(ctx, processState.state.sent > 0 ? nextIterationDelayMs : 0);
  }

  function scheduleSendWhenIdle(ctx: LoopCtx | undefined, delayMs: number) {
    processState.scheduledSend = setTimeout(() => {
      processState.scheduledSend = undefined;
      if (!processState.state.active) return;
      if (ctx?.isIdle?.() === false) {
        scheduleSendWhenIdle(ctx, idleRetryMs);
        return;
      }
      void sendNext(ctx).catch((error: unknown) => {
        stopLoop(ctx, `Loop stopped after failing to start the next iteration: ${errorMessage(error)}`, "error");
      });
    }, delayMs);
  }

  async function sendNext(ctx: LoopCtx | undefined) {
    const state = processState.state;
    if (!state.active) return false;
    if (state.sent >= MAX_LOOP_SENDS) {
      stopLoop(ctx, `Loop stopped after reaching the emergency cap of ${MAX_LOOP_SENDS} prompts.`);
      return false;
    }

    if (state.sent === 0) return sendInCurrentSession(ctx);
    return sendInNewSession(ctx);
  }

  function sendInCurrentSession(ctx: LoopCtx | undefined) {
    const prompt = processState.state.prompt;
    processState.state.pendingSend = false;
    processState.state.sent += 1;
    updateStatus(ctx);
    pi.sendUserMessage(prompt);
    return true;
  }

  async function sendInNewSession(ctx: LoopCtx | undefined) {
    const nextCtx = processState.controlCtx;
    if (typeof nextCtx?.newSession !== "function") {
      stopLoop(ctx, "Loop stopped because a new session cannot be started from this context.", "error");
      return false;
    }

    const prompt = processState.state.prompt;
    const nextSent = processState.state.sent + 1;
    const parentSession = nextCtx.sessionManager?.getSessionFile?.();
    processState.preserveNextNewSession = true;
    processState.preservedTargetSessionFile = undefined;
    try {
      const result = await nextCtx.newSession({
        parentSession,
        withSession: async (replacementCtx) => {
          processState.controlCtx = replacementCtx;
          if (!processState.state.active) return;
          processState.state.pendingSend = false;
          processState.state.sent = nextSent;
          updateStatus(replacementCtx);
          await replacementCtx.sendUserMessage(prompt);
        },
      });
      if (result.cancelled) {
        stopLoop(ctx, "Loop stopped because new session creation was cancelled.", "warning");
        return false;
      }
      return true;
    } finally {
      processState.preserveNextNewSession = false;
      processState.preservedTargetSessionFile = undefined;
    }
  }

  async function resolvePrompt(parsed: { prompt?: string }, ctx: LoopCtx) {
    const inlinePrompt = parsed.prompt?.trim();
    if (inlinePrompt) return inlinePrompt;

    if (!ctx.hasUI || typeof ctx.ui?.editor !== "function") {
      notify(ctx, LOOP_USAGE, "warning");
      return undefined;
    }

    const edited = await ctx.ui.editor("Prompt to repeat with /loop", "");
    return edited?.trim() || "";
  }

  async function startLoop(parsed: { prompt?: string }, ctx: LoopControlCtx) {
    const prompt = await resolvePrompt(parsed, ctx);
    if (prompt === undefined) return;
    const validationError = validateLoopPrompt(prompt);
    if (validationError) {
      notify(ctx, validationError, "error");
      return;
    }

    const replacing = processState.state.active;
    clearScheduledSend();
    processState.controlCtx = ctx;
    processState.preserveNextNewSession = false;
    processState.preservedTargetSessionFile = undefined;
    processState.state = {
      active: true,
      prompt,
      sent: 0,
      pendingSend: false,
    };
    updateStatus(ctx);
    notify(ctx, replacing ? "Loop replaced." : "Loop started.", "info");

    if (ctx?.isIdle?.() === false) {
      processState.state.pendingSend = true;
      updateStatus(ctx);
      notify(ctx, "Loop will send the first prompt after the current agent turn finishes.", "info");
      return;
    }

    sendNext(ctx);
  }

  pi.registerCommand("loop", {
    description: "Repeat an explicit prompt after each agent turn until stopped",
    getArgumentCompletions: (prefix: string) => {
      const options = ["start", "stop", "status", "help"];
      const filtered = options.filter((option) => option.startsWith(prefix.trim().toLowerCase()));
      return filtered.length ? filtered.map((option) => ({ value: option, label: option })) : null;
    },
    handler: async (args, ctx) => {
      const parsed = parseLoopArgs(args);

      if (parsed.action === "stop") {
        if (processState.state.active) stopLoop(ctx, "Loop stopped.");
        else notify(ctx, "No active loop.", "info");
        return;
      }

      if (parsed.action === "status") {
        notify(ctx, formatLoopStatus(processState.state), "info");
        return;
      }

      if (parsed.action === "help") {
        notify(ctx, LOOP_USAGE, "info");
        return;
      }

      await startLoop(parsed, ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    sendNextWhenIdle(ctx);
  });

  pi.on("session_shutdown", async (event, ctx) => {
    if (event.reason === "new" && processState.preserveNextNewSession) {
      const targetSessionFile = event.targetSessionFile ?? "";
      processState.preservedTargetSessionFile ??= targetSessionFile;
      if (processState.preservedTargetSessionFile === targetSessionFile) {
        clearScheduledSend();
        return;
      }
    }
    reset(ctx);
  });
}

export function parseLoopArgs(args: string | undefined): LoopParsedArgs {
  const value = (args || "").trim();
  if (!value) return { action: "start" };
  if (value.startsWith("--")) return { action: "start", prompt: value.slice(2).trim() };

  const lower = value.toLowerCase();
  if (lower === "stop") return { action: "stop" };
  if (lower === "status") return { action: "status" };
  if (lower === "help" || lower === "--help" || lower === "-h") return { action: "help" };
  if (lower === "start") return { action: "start" };
  if (lower.startsWith("start ")) return { action: "start", prompt: value.slice(6).trim() };

  return { action: "start", prompt: value };
}

export function validateLoopPrompt(prompt: string) {
  const value = prompt.trim();
  if (!value) return "Loop cancelled: no prompt provided.";
  if (/^\/loop(?:\s|$)/i.test(value))
    return "Loop prompts cannot start with /loop because that would recursively control the loop command.";
  return undefined;
}

function createInactiveState(): LoopState {
  return {
    active: false,
    prompt: "",
    sent: 0,
    pendingSend: false,
  };
}

function getLoopProcessState(stateKey: PropertyKey): LoopProcessState {
  const globalState = globalThis as typeof globalThis & {
    [LOOP_STATE_STORE_PROPERTY]?: Map<PropertyKey, LoopProcessState>;
  };
  globalState[LOOP_STATE_STORE_PROPERTY] ??= new Map();

  let processState = globalState[LOOP_STATE_STORE_PROPERTY].get(stateKey);
  if (!processState) {
    processState = {
      state: createInactiveState(),
      preserveNextNewSession: false,
    };
    globalState[LOOP_STATE_STORE_PROPERTY].set(stateKey, processState);
  }
  return processState;
}

function formatLoopStatus(state: LoopState) {
  if (!state.active) return "Loop inactive.";
  const pending = state.pendingSend ? " Next send pending until the agent is awaiting input." : "";
  return `Loop active: ${state.sent}/${MAX_LOOP_SENDS} prompt(s) sent.${pending} Prompt: ${previewPrompt(state.prompt)}`;
}

function previewPrompt(prompt: string) {
  return prompt.length <= 120 ? prompt : `${prompt.slice(0, 117)}...`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
