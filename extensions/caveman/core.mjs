import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { atomicWritePrivateFileSync } from "../shared/private-storage.ts";

export const VALID_LEVELS = ["lite", "full", "ultra"];
export const LEVEL_ALIASES = {};
export const COMMAND_TOKENS = [...VALID_LEVELS, ...Object.keys(LEVEL_ALIASES), "off", "on", "status"];
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

export function normalizeLevel(value) {
  if (typeof value !== "string") return undefined;
  const aliased = LEVEL_ALIASES[value] || value;
  return VALID_LEVELS.includes(aliased) ? aliased : undefined;
}

export function isLevel(value) {
  return normalizeLevel(value) !== undefined;
}

export function normalizeState(parsed) {
  return {
    enabled: parsed?.enabled !== false,
    level: normalizeLevel(parsed?.level) || DEFAULT_STATE.level,
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

export function writeState(state, fsImpl, dataDir = DATA_DIR, statePath = STATE_PATH) {
  try {
    const content = `${JSON.stringify(normalizeState(state), null, 2)}\n`;
    if (!fsImpl) atomicWritePrivateFileSync(statePath, content);
    else {
      fsImpl.mkdirSync(dataDir, { recursive: true });
      fsImpl.writeFileSync(statePath, content, "utf8");
    }
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}

export function displayLevel(level) {
  return normalizeLevel(level) || DEFAULT_STATE.level;
}

export function statusLine(state) {
  return state.enabled ? `🪨 caveman ${displayLevel(state.level)} •` : "🪨 caveman off •";
}

const LEVEL_INSTRUCTIONS = {
  lite: "Trim filler; keep normal grammar when useful.",
  full: "Use fragments + short cause/effect. Drop articles when clear.",
  ultra: "Telegraphic: arrows, abbrev prose, fragments, one-line answers when enough.",
};

const LEVEL_EXAMPLES = {
  lite: '"Component re-renders because each render creates a new object ref. Use `useMemo`."',
  full: '"New object ref each render → re-render. Use `useMemo`."',
  ultra: '"Inline obj prop → new ref → re-render. `useMemo`."',
};

export function buildCavemanPrompt(level) {
  const normalizedLevel = normalizeLevel(level) || DEFAULT_STATE.level;
  const instructions = LEVEL_INSTRUCTIONS[normalizedLevel];
  const example = LEVEL_EXAMPLES[normalizedLevel];

  return `<caveman-mode active level="${normalizedLevel}">
Caveman ON: fewer output tokens, same accuracy. ACTIVE EVERY RESPONSE; use /caveman off to disable future turns.
Core:
- Preserve technical accuracy. Do not dumb down code, commands, diffs, commit msgs, APIs, quotes.
- Use English only. Keep exact code/paths/errors/logs unchanged.
- Do not drift verbose. Drop filler/hedging/pleasantries. Short. Direct.
- Keep required templates/checklists, commands, and safety details; compress prose around them.
- For safety warning, irreversible action confirmation, legal/security detail, or complex ordering, use clear normal English.
- If user asks "normal mode" or pro wording, answer normally for that response.
Intensity ${normalizedLevel}: ${instructions}
Example: ${example}
</caveman-mode>`;
}
