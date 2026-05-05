// @ts-nocheck
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  buildCavemanPrompt,
  COMMAND_TOKENS,
  COMPLETION_ITEMS,
  displayLevel,
  isLevel,
  normalizeLevel,
  readState,
  statusLine,
  writeState,
} from "./core.mjs";

type Level = "lite" | "full" | "ultra" | "wenyan-lite" | "wenyan-full" | "wenyan-ultra";

type CavemanState = {
  enabled: boolean;
  level: Level;
};

type CavemanUi = {
  notify: (message: string, level: "info" | "warning" | "error" | "success") => void;
  setStatus: (name: string, value: string | undefined) => void;
};

export default function cavemanExtension(pi: ExtensionAPI) {
  let state = readState() as CavemanState;
  let cachedInjection: string | null = null;

  function setState(next: CavemanState, ui: CavemanUi, message: string): void {
    const result = writeState(next);
    /* node:coverage ignore next 4 */
    if (!result.ok) {
      ui.notify(`caveman: failed to save state: ${result.reason}`, "error");
      return;
    }

    state = next;
    cachedInjection = null;
    ui.setStatus("caveman", statusLine(state));
    ui.notify(message, "info");
  }

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus("caveman", statusLine(state));
  });

  pi.on("before_agent_start", (event) => {
    if (!state.enabled) return undefined;

    cachedInjection ??= buildCavemanPrompt(state.level);
    return {
      systemPrompt: event.systemPrompt + cachedInjection,
    };
  });

  pi.registerCommand("caveman", {
    description: "Toggle caveman language and choose intensity (lite/full/ultra/wenyan-lite/wenyan/wenyan-ultra/on/off/status)",
    getArgumentCompletions: (prefix) => {
      const filtered = COMPLETION_ITEMS.filter(({ value }) => value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim() || "status";

      if (arg === "status") {
        ctx.ui.notify(statusLine(state), "info");
        return;
      }

      if (arg === "off") {
        setState({ ...state, enabled: false }, ctx.ui, "caveman OFF");
        return;
      }

      if (arg === "on") {
        setState({ ...state, enabled: true }, ctx.ui, `caveman ON (${displayLevel(state.level)})`);
        return;
      }

      if (isLevel(arg)) {
        const level = normalizeLevel(arg) as Level;
        setState({ enabled: true, level }, ctx.ui, `caveman ON (${displayLevel(level)})`);
        return;
      }

      ctx.ui.notify(`caveman: unknown arg "${arg}". Try: ${COMMAND_TOKENS.join(", ")}`, "warning");
    },
  });
}
