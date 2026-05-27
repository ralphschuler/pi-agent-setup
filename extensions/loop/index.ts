import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

export const MAX_LOOP_SENDS = 50;
export const LOOP_IDLE_RETRY_MS = 25;
export const LOOP_USAGE = "Usage: /loop [prompt] | /loop start [prompt] | /loop stop | /loop status | /loop help";

export type LoopParsedArgs = { action: "start"; prompt?: string } | { action: "stop" } | { action: "status" } | { action: "help" };

type LoopState = {
  active: boolean;
  prompt: string;
  sent: number;
  pendingSend: boolean;
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

export default function loopExtension(pi: ExtensionAPI) {
  let state = createInactiveState();
  let scheduledSend: ReturnType<typeof setTimeout> | undefined;

  function notify(ctx: LoopCtx | undefined, message: string, level: "info" | "warning" | "error" = "info") {
    ctx?.ui?.notify?.(message, level);
  }

  function updateStatus(ctx: LoopCtx | undefined) {
    if (!ctx?.hasUI) return;
    ctx.ui?.setStatus?.("loop", state.active ? `loop: ${state.sent}/${MAX_LOOP_SENDS}` : undefined);
  }

  function clearScheduledSend() {
    if (scheduledSend) clearTimeout(scheduledSend);
    scheduledSend = undefined;
  }

  function reset(ctx: LoopCtx | undefined) {
    clearScheduledSend();
    state = createInactiveState();
    updateStatus(ctx);
  }

  function stopLoop(ctx: LoopCtx | undefined, message?: string) {
    reset(ctx);
    if (message) notify(ctx, message, "info");
  }

  function sendNextWhenIdle(ctx: LoopCtx | undefined) {
    if (!state.active || scheduledSend) return;
    state.pendingSend = true;
    updateStatus(ctx);
    scheduleSendWhenIdle(ctx, 0);
  }

  function scheduleSendWhenIdle(ctx: LoopCtx | undefined, delayMs: number) {
    scheduledSend = setTimeout(() => {
      scheduledSend = undefined;
      if (!state.active) return;
      if (ctx?.isIdle?.() === false) {
        scheduleSendWhenIdle(ctx, LOOP_IDLE_RETRY_MS);
        return;
      }
      sendNext(ctx);
    }, delayMs);
  }

  function sendNext(ctx: LoopCtx | undefined) {
    if (!state.active) return false;
    if (state.sent >= MAX_LOOP_SENDS) {
      stopLoop(ctx, `Loop stopped after reaching the emergency cap of ${MAX_LOOP_SENDS} prompts.`);
      return false;
    }

    state.pendingSend = false;
    state.sent += 1;
    updateStatus(ctx);
    pi.sendUserMessage(state.prompt);
    return true;
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

  async function startLoop(parsed: { prompt?: string }, ctx: LoopCtx) {
    const prompt = await resolvePrompt(parsed, ctx);
    if (prompt === undefined) return;
    const validationError = validateLoopPrompt(prompt);
    if (validationError) {
      notify(ctx, validationError, "error");
      return;
    }

    const replacing = state.active;
    clearScheduledSend();
    state = {
      active: true,
      prompt,
      sent: 0,
      pendingSend: false,
    };
    updateStatus(ctx);
    notify(ctx, replacing ? "Loop replaced." : "Loop started.", "info");

    if (ctx?.isIdle?.() === false) {
      state.pendingSend = true;
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
        if (state.active) stopLoop(ctx, "Loop stopped.");
        else notify(ctx, "No active loop.", "info");
        return;
      }

      if (parsed.action === "status") {
        notify(ctx, formatLoopStatus(state), "info");
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

  pi.on("session_shutdown", async (_event, ctx) => {
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

function formatLoopStatus(state: LoopState) {
  if (!state.active) return "Loop inactive.";
  const pending = state.pendingSend ? " Next send pending until the agent is awaiting input." : "";
  return `Loop active: ${state.sent}/${MAX_LOOP_SENDS} prompt(s) sent.${pending} Prompt: ${previewPrompt(state.prompt)}`;
}

function previewPrompt(prompt: string) {
  return prompt.length <= 120 ? prompt : `${prompt.slice(0, 117)}...`;
}
