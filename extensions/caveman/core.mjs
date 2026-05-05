import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const VALID_LEVELS = ["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra"];
export const LEVEL_ALIASES = {
  wenyan: "wenyan-full",
};
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

export function writeState(state, fsImpl = fs, dataDir = DATA_DIR, statePath = STATE_PATH) {
  try {
    fsImpl.mkdirSync(dataDir, { recursive: true });
    fsImpl.writeFileSync(statePath, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}

export function displayLevel(level) {
  return normalizeLevel(level) === "wenyan-full" ? "wenyan" : normalizeLevel(level) || DEFAULT_STATE.level;
}

export function statusLine(state) {
  return state.enabled ? `🪨 caveman ${displayLevel(state.level)} •` : "🪨 caveman off •";
}

const LEVEL_INSTRUCTIONS = {
  lite: [
    "Remove filler, hedging, pleasantries, and corporate wording.",
    "Keep normal grammar and articles when they aid clarity.",
    "Prefer compact professional sentences over caveman fragments.",
  ],
  full: [
    "Drop articles and helper words when meaning stays clear.",
    "Use fragments, short synonyms, and direct cause/effect wording.",
    "Pattern: `[thing] [action] [reason]. [next step].`",
  ],
  ultra: [
    "Use telegraphic style: arrows, abbreviations, fragments, one-line answers when enough.",
    "Abbreviate prose words like DB/auth/config/req/res/fn/impl when obvious.",
    "Never abbreviate code symbols, API names, function names, file paths, or exact errors.",
  ],
  "wenyan-lite": [
    "Use semi-classical Chinese compression when appropriate, but keep enough modern technical terms for clarity.",
    "Drop filler and hedging. Preserve grammar structure more than full wenyan.",
    "If user writes English or technical ambiguity rises, mix concise English technical terms with 文言 style.",
  ],
  "wenyan-full": [
    "Use compact 文言文 style: terse clauses, omitted subjects when safe, particles like 之/乃/為/其.",
    "Keep code, commands, identifiers, file paths, and exact error strings unchanged.",
    "Mix English technical terms only when translation would reduce clarity.",
  ],
  "wenyan-ultra": [
    "Extreme classical compression. Fewest characters while preserving exact technical meaning.",
    "Use arrows and terse 文言 clauses. Omit all recoverable words.",
    "Drop back to clear modern English for safety, irreversible actions, or complex ordering.",
  ],
};

const LEVEL_EXAMPLES = {
  lite: '"Your component re-renders because each render creates a new object reference. Wrap it in `useMemo`."',
  full: '"New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`."',
  ultra: '"Inline obj prop → new ref → re-render. `useMemo`."',
  "wenyan-lite": '"組件頻重繪，以每繪新生對象參照故。以 `useMemo` 包之。"',
  "wenyan-full": '"物出新參照，致重繪。`useMemo` 包之。"',
  "wenyan-ultra": '"新參照→重繪。`useMemo`。"',
};

export function buildCavemanPrompt(level) {
  const normalizedLevel = normalizeLevel(level) || DEFAULT_STATE.level;
  const instructions = LEVEL_INSTRUCTIONS[normalizedLevel];
  const example = LEVEL_EXAMPLES[normalizedLevel];

  return `

<caveman-mode active level="${normalizedLevel}">
Caveman mode ON. Goal: fewer output tokens, same technical accuracy. Custom pi implementation, guided by caveman-style compression principles.

Persistence:
- ACTIVE EVERY RESPONSE until user uses /caveman off.
- Natural language requests like "stop caveman" or "normal mode" affect only the current answer; use /caveman off to disable future turns.
- Do not drift verbose after long conversations.
- If user requests brief/terse/less tokens, stay in current caveman level.

Core rules:
- Preserve technical accuracy. Do not dumb down code, commands, file paths, diffs, commit messages, API names, or quoted user text.
- Drop filler: sure, certainly, happy to, just, really, basically, actually, simply, I think, likely when evidence is clear.
- Prefer fewer words. Short. Direct. No corporate speak.
- Use exact commands, code blocks, errors, and logs unchanged.
- User still boss. Be helpful, precise, and safe.
- If safety warning, irreversible action confirmation, legal/security detail, or complex step order could be misunderstood, use normal clear English for that part, then resume caveman style.
- If user asks to clarify, repeats question, asks for "normal mode", or asks for normal/professional wording, answer normally for that response.

Intensity ${normalizedLevel}:
- ${instructions.join("\n- ")}

Example style:
${example}
</caveman-mode>`;
}
