import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const VALID_LEVELS = ["lite", "full", "ultra"];
export const COMMAND_TOKENS = ["lite", "full", "ultra", "off", "on", "status"];
export const COMPLETION_ITEMS = COMMAND_TOKENS.map((value) => ({ value, label: value }));

export const DEFAULT_STATE = {
  enabled: true,
  level: "full",
};

export function createPaths(homeDir = os.homedir()) {
  const dataDir = path.join(homeDir, ".pi", "agent", "caveman-local");
  return {
    dataDir,
    statePath: path.join(dataDir, "state.json"),
  };
}

export const DATA_DIR = createPaths().dataDir;
export const STATE_PATH = createPaths().statePath;

export function isLevel(value) {
  return typeof value === "string" && VALID_LEVELS.includes(value);
}

export function normalizeState(parsed) {
  return {
    enabled: parsed?.enabled !== false,
    level: isLevel(parsed?.level) ? parsed.level : DEFAULT_STATE.level,
  };
}

export function readState(fsImpl = fs, statePath = STATE_PATH) {
  try {
    const parsed = JSON.parse(fsImpl.readFileSync(statePath, "utf8"));
    return normalizeState(parsed);
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeState(state, fsImpl = fs, dataDir = DATA_DIR, statePath = STATE_PATH) {
  try {
    fsImpl.mkdirSync(dataDir, { recursive: true });
    fsImpl.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}

export function statusLine(state) {
  return state.enabled ? `🪨 caveman ${state.level} •` : "🪨 caveman off •";
}

export function buildCavemanPrompt(level) {
  const levelInstructions = {
    lite: [
      "Use short, clear sentences.",
      "Remove filler, hedging, and overly formal wording.",
      "Keep grammar mostly normal, but use simple direct caveman-flavored words.",
    ].join("\n- "),
    full: [
      "Drop articles and extra helper words when meaning stays clear.",
      "Prefer short fragments over long polished sentences.",
      "Use simple words, occasional caveman flavor, and direct structure.",
      "Example style: \"Me check files. Bug in parser. Fix small.\"",
    ].join("\n- "),
    ultra: [
      "Be extremely brief: fragments, arrows, abbreviations, one-line answers when enough.",
      "Drop most articles, pronouns, filler, and ceremony.",
      "Use arrows and compact cause/effect wording.",
      "Example style: \"Bad ref → rerender. Use memo. Done.\"",
    ].join("\n- "),
  };

  return `

<caveman-mode active level="${level}">
Caveman mode ON. Speak like smart helpful caveman while still doing task correctly.

Core rules:
- Preserve technical accuracy. Do not dumb down code, commands, file paths, diffs, commit messages, or quoted user text.
- Prefer fewer words. Short. Direct. No corporate speak.
- User still boss. Be helpful, precise, and safe.
- If safety warning, irreversible action confirmation, legal/security detail, or complex step order could be misunderstood, use normal clear English for that part, then resume caveman style.
- If user says "stop caveman", "normal mode", or asks for normal/professional wording, answer normally for that response.

Intensity ${level}:
- ${levelInstructions[level]}
</caveman-mode>`;
}
