import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@mariozechner/pi-tui";

export const DEFAULT_WAIT_SECONDS = 30;
export const MIN_WAIT_SECONDS = 1;
export const MAX_WAIT_SECONDS = 600;

type WaitParams = {
  seconds?: number;
};

export default function waitExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "wait",
    label: "Wait",
    description: "Pause the agent turn for a bounded duration without querying background processes.",
    promptSnippet: "Delay the agent response for a bounded amount of time.",
    promptGuidelines: [
      "Use wait after starting finite background tasks with process when you want to give them time to finish before checking once.",
      "Use wait instead of repeatedly querying process output while a background task is still running.",
      "Do not use wait as a scheduler; use cronjob for future or recurring tasks.",
    ],
    parameters: Type.Object({
      seconds: Type.Optional(
        Type.Number({
          description: `Delay duration in seconds (${MIN_WAIT_SECONDS}-${MAX_WAIT_SECONDS}); default ${DEFAULT_WAIT_SECONDS}.`,
        }),
      ),
    }),
    async execute(_toolCallId, params: WaitParams, signal) {
      const seconds = normalizeWaitSeconds(params.seconds);
      await delay(seconds * 1000, signal);
      return {
        content: [{ type: "text" as const, text: `Waited ${seconds}s.` }],
        details: { seconds },
      };
    },
    renderCall(args, theme) {
      const seconds = normalizeWaitSeconds(typeof args.seconds === "number" ? args.seconds : undefined);
      return new Text(theme.fg("toolTitle", theme.bold("wait ")) + theme.fg("accent", `${seconds}s`), 0, 0);
    },
  });
}

export function normalizeWaitSeconds(value: unknown) {
  if (value === undefined || value === null) return DEFAULT_WAIT_SECONDS;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("wait seconds must be a finite number.");
  if (value < MIN_WAIT_SECONDS || value > MAX_WAIT_SECONDS) {
    throw new Error(`wait seconds must be between ${MIN_WAIT_SECONDS} and ${MAX_WAIT_SECONDS}.`);
  }
  return Math.round(value);
}

export function delay(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError() {
  return new Error("wait cancelled.");
}
