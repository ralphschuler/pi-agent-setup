import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const STORE_PATH = join(homedir(), ".pi", "agent", "tamagotchi-pet.json");
const STATE_VERSION = 1;
const WIDGET_KEY = "tamagotchi-pet";
const STATUS_KEY = "pet";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BUG_PATTERN = /\b(bug|fix|fixed|failing|failure|fail|error|exception|crash|broken|regression|test|lint|typecheck|debug|issue)\b/i;
const VERIFY_PATTERN =
  /\b(test|spec|check|lint|typecheck|tsc|vitest|jest|mocha|pytest|cargo test|go test|npm test|npm run test|npm run check)\b/i;
const DOC_PATH_PATTERN = /(^|[\/])(README|docs|CHANGELOG|CONTRIBUTING)|\.(md|mdx|txt|rst)$/i;
const TEST_PATH_PATTERN = /(^|[\/])(__tests__|tests?|specs?)[\/]|\.(test|spec)\.[cm]?[jt]sx?$/i;

type Mood = "happy" | "ok" | "hungry" | "sad";
type RewardKind = "tests-added" | "docs-updated";

type PetState = {
  version: number;
  name: string;
  level: number;
  xp: number;
  meals: number;
  bugsFixed: number;
  streakDays: number;
  bestStreakDays: number;
  achievements: string[];
  lastAchievementAt: number;
  lastActiveDay: string;
  lastFedAt: number;
  lastSeenAt: number;
  lastMeal: string;
};

const defaultState = (): PetState => ({
  version: STATE_VERSION,
  name: "Pi-tchi",
  level: 1,
  xp: 0,
  meals: 0,
  bugsFixed: 0,
  streakDays: 0,
  bestStreakDays: 0,
  achievements: [],
  lastAchievementAt: 0,
  lastActiveDay: "",
  lastFedAt: Date.now(),
  lastSeenAt: Date.now(),
  lastMeal: "fresh install",
});

export default function tamagotchiPet(pi: ExtensionAPI) {
  let state = defaultState();
  let lastCtx: { ui?: PetUi } | undefined;
  let interval: NodeJS.Timeout | undefined;
  let bugFixTurn = false;
  let changedDuringBugTurn = false;
  let fedThisTurn = false;
  let turnRewards = new Set<RewardKind>();

  async function loadStore() {
    try {
      const raw = await readFile(STORE_PATH, "utf8");
      state = normalizeState(JSON.parse(raw));
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "ENOENT") console.warn(`[tamagotchi] Failed to read ${STORE_PATH}:`, error);
      state = defaultState();
    }
    agePet();
  }

  async function saveStore() {
    await mkdir(dirname(STORE_PATH), { recursive: true });
    const tempPath = `${STORE_PATH}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempPath, STORE_PATH);
  }

  function updateUi(ctx = lastCtx) {
    lastCtx = ctx;
    const ui = ctx?.ui;
    if (!ui) return;
    ui.setWidget?.(WIDGET_KEY, renderWidgetLines(), { placement: "belowEditor" });
    ui.setStatus?.(STATUS_KEY, renderStatus());
  }

  async function feed(reason: string, amount = 35, options: { bugCredit?: boolean; verified?: boolean } = {}) {
    agePet();
    updateStreak();
    state.meals += 1;
    if (options.bugCredit !== false) state.bugsFixed += 1;
    state.xp += amount;
    while (state.xp >= xpForNextLevel(state.level)) {
      state.xp -= xpForNextLevel(state.level);
      state.level += 1;
    }
    state.lastFedAt = Date.now();
    state.lastSeenAt = Date.now();
    state.lastMeal = singleLine(reason, 90);
    const unlocked = unlockAchievements(options.verified === true);
    await saveStore();
    updateUi();
    const suffix = unlocked.length ? ` Achievement: ${unlocked.join(", ")}` : "";
    lastCtx?.ui?.notify?.(`🐛➡️🍚 ${state.name} ate: ${state.lastMeal}.${suffix}`, "success");
  }

  pi.on("session_start", async (_event, ctx) => {
    await loadStore();
    updateUi(ctx);
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
      agePet();
      updateUi();
      saveStore().catch((error) => console.warn("[tamagotchi] Failed to save pet state:", error));
    }, 60_000);
  });

  pi.on("agent_start", async (_event, ctx) => {
    await loadStore();
    updateUi(ctx);
  });

  pi.on("session_shutdown", async () => {
    if (interval) clearInterval(interval);
    interval = undefined;
    agePet();
    await saveStore();
  });

  pi.on("before_agent_start", async (event, ctx) => {
    lastCtx = ctx;
    bugFixTurn = BUG_PATTERN.test(event.prompt);
    changedDuringBugTurn = false;
    fedThisTurn = false;
    turnRewards = new Set<RewardKind>();
    agePet();
    updateUi(ctx);
  });

  pi.on("tool_result", async (event) => {
    if (event.isError) return;

    if (bugFixTurn && (event.toolName === "edit" || event.toolName === "write")) {
      changedDuringBugTurn = true;
      for (const reward of classifyEditReward(event.input)) turnRewards.add(reward);
      updateUi();
      return;
    }

    if (!fedThisTurn && changedDuringBugTurn && event.toolName === "bash") {
      const command = stringifyInputCommand(event.input);
      if (VERIFY_PATTERN.test(command)) {
        fedThisTurn = true;
        await feed(`verified fix: ${singleLine(command, 70)}`, 50, { verified: true });
      }
    }
  });

  pi.on("agent_end", async () => {
    if (!fedThisTurn && changedDuringBugTurn) {
      fedThisTurn = true;
      const reward = bestTurnReward(turnRewards);
      if (reward === "tests-added") await feed("tests added", 40);
      else if (reward === "docs-updated") await feed("docs updated", 20, { bugCredit: false });
      else await feed("bug-fix edit", 30);
    } else {
      agePet();
      await saveStore();
      updateUi();
    }
  });

  pi.registerCommand("pet", {
    description: "[stats|achievements|mood|reset|name <name>] — show or configure the bug-fed Tamagotchi pet",
    handler: async (args, ctx) => {
      lastCtx = ctx;
      const raw = args.trim();
      const action = raw.toLowerCase();
      if (action === "reset") {
        state = defaultState();
        await saveStore();
        updateUi(ctx);
        ctx.ui.notify(`${state.name} hatched again.`, "info");
        return;
      }
      if (action.startsWith("name ")) {
        const name = raw.slice(5).trim();
        if (name) {
          state.name = singleLine(name, 24);
          await saveStore();
          updateUi(ctx);
        }
      }
      if (action === "achievements") {
        ctx.ui.notify(renderAchievements(), "info");
        return;
      }
      if (action === "mood") {
        ctx.ui.notify(renderMood(), "info");
        return;
      }
      ctx.ui.notify(`${renderPlainStats()}\nStore: ${STORE_PATH}`, "info");
    },
  });

  function renderWidgetLines() {
    agePet();
    const mood = currentMood(state);
    const pct = hungerPercent(state);
    const art = petArt(mood);
    const xpNeeded = xpForNextLevel(state.level);
    const xpPct = Math.round((state.xp / xpNeeded) * 100);
    const lastMeal = singleLine(state.lastMeal, 44);
    const stage = stageForState(state);
    const lines = [
      `┌ ${art} ${state.name}  Lv.${state.level} ${stage}  ${moodLabel(mood)}`,
      `├ hunger ${bar(pct, 12)} ${String(pct).padStart(3)}%  streak ${state.streakDays}d`,
      `├ xp     ${bar(xpPct, 12)} ${state.xp}/${xpNeeded}`,
      `└ bugs ${state.bugsFixed}  meals ${state.meals}  last: ${lastMeal}`,
    ];
    if (changedDuringBugTurn && !fedThisTurn) lines.push("🐛 sniffing a fresh bug fix… run tests/checks to make it extra tasty");
    return lines;
  }

  function renderStatus() {
    const mood = currentMood(state);
    return `${petArt(mood)} ${state.name} Lv.${state.level} ${stageForState(state)} ${moodLabel(mood)}`;
  }

  function renderPlainStats() {
    return [
      `${petArt(currentMood(state))} ${state.name} level ${state.level} ${stageForState(state)} (${moodLabel(currentMood(state))})`,
      `Fed: ${hungerPercent(state)}%`,
      `Global across sessions: yes`,
      `Bugs eaten: ${state.bugsFixed}`,
      `Meals: ${state.meals}`,
      `Streak: ${state.streakDays} days (best ${state.bestStreakDays})`,
      `Achievements: ${state.achievements.length}`,
      `Last meal: ${state.lastMeal}`,
    ].join("\n");
  }

  function renderAchievements() {
    return state.achievements.length
      ? `Achievements:\n${state.achievements.map((name) => `- ${name}`).join("\n")}`
      : "No achievements yet. Fix bugs to unlock them.";
  }

  function renderMood() {
    return [
      `${petArt(currentMood(state))} Mood: ${moodLabel(currentMood(state))}`,
      `Hunger: ${hungerPercent(state)}%`,
      `Stage: ${stageForState(state)}`,
      `Next level: ${state.xp}/${xpForNextLevel(state.level)} XP`,
    ].join("\n");
  }

  function updateStreak() {
    const today = dayKey(Date.now());
    if (!state.lastActiveDay) {
      state.streakDays = 1;
    } else if (state.lastActiveDay === today) {
      state.streakDays = Math.max(1, state.streakDays);
    } else if (dayKey(Date.now() - DAY) === state.lastActiveDay) {
      state.streakDays += 1;
    } else {
      state.streakDays = 1;
    }
    state.lastActiveDay = today;
    state.bestStreakDays = Math.max(state.bestStreakDays, state.streakDays);
  }

  function unlockAchievements(verified: boolean) {
    const unlocked: string[] = [];
    const checks: Array<[string, boolean]> = [
      ["first bug snack", state.bugsFixed >= 1],
      ["verified fix feast", verified],
      ["bug buffet", state.bugsFixed >= 10],
      ["junior evolution", state.level >= 5],
      ["three-day streak", state.streakDays >= 3],
    ];
    for (const [name, ok] of checks) {
      if (!ok || state.achievements.includes(name)) continue;
      state.achievements.push(name);
      unlocked.push(name);
    }
    if (unlocked.length) state.lastAchievementAt = Date.now();
    return unlocked;
  }

  function agePet() {
    state.lastSeenAt = Date.now();
  }
}

type PetUi = {
  setWidget?: (key: string, widget: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }) => void;
  setStatus?: (key: string, value: string | undefined) => void;
  notify?: (message: string, level?: "info" | "success" | "warning" | "error") => void;
};

function normalizeState(value: Partial<PetState>): PetState {
  const fallback = defaultState();
  const achievements = Array.isArray(value.achievements)
    ? value.achievements.filter((item): item is string => typeof item === "string")
    : [];
  return {
    version: STATE_VERSION,
    name: typeof value.name === "string" && value.name.trim() ? singleLine(value.name, 24) : fallback.name,
    level: positiveInt(value.level, fallback.level),
    xp: positiveInt(value.xp, fallback.xp),
    meals: positiveInt(value.meals, fallback.meals),
    bugsFixed: positiveInt(value.bugsFixed, fallback.bugsFixed),
    streakDays: positiveInt(value.streakDays, fallback.streakDays),
    bestStreakDays: positiveInt(value.bestStreakDays, fallback.bestStreakDays),
    achievements,
    lastAchievementAt: positiveInt(value.lastAchievementAt, fallback.lastAchievementAt),
    lastActiveDay: typeof value.lastActiveDay === "string" ? value.lastActiveDay : fallback.lastActiveDay,
    lastFedAt: positiveInt(value.lastFedAt, fallback.lastFedAt),
    lastSeenAt: positiveInt(value.lastSeenAt, fallback.lastSeenAt),
    lastMeal: typeof value.lastMeal === "string" && value.lastMeal.trim() ? singleLine(value.lastMeal, 90) : fallback.lastMeal,
  };
}

function positiveInt(value: unknown, fallback: number) {
  return Number.isFinite(value) && Number(value) >= 0 ? Math.floor(Number(value)) : fallback;
}

function currentMood(state: PetState): Mood {
  const pct = hungerPercent(state);
  if (pct >= 70) return "happy";
  if (pct >= 40) return "ok";
  if (pct >= 15) return "hungry";
  return "sad";
}

function hungerPercent(state: PetState) {
  const hoursSinceFed = Math.max(0, (Date.now() - state.lastFedAt) / HOUR);
  return Math.max(0, Math.min(100, Math.round(100 - hoursSinceFed * 4)));
}

function xpForNextLevel(level: number) {
  return 100 + (level - 1) * 25;
}

function stageForState(state: PetState) {
  if (state.level >= 20) return "daemon";
  if (state.level >= 10) return "hacker";
  if (state.level >= 5) return "junior";
  return "hatchling";
}

function petArt(mood: Mood) {
  return mood === "happy" ? "ʕ•ᴥ•ʔ" : mood === "ok" ? "ʕ·ᴥ·ʔ" : mood === "hungry" ? "ʕºᴥºʔ" : "ʕ；ᴥ；ʔ";
}

function moodLabel(mood: Mood) {
  return mood === "happy" ? "happy" : mood === "ok" ? "content" : mood === "hungry" ? "hungry" : "starving";
}

function bar(percent: number, cells: number) {
  const filled = Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)));
  return "[" + "█".repeat(filled) + "░".repeat(cells - filled) + "]";
}

function singleLine(text: string, max: number) {
  const cleaned = text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, Math.max(0, max - 1))}…`;
}

function classifyEditReward(input: unknown): RewardKind[] {
  const text = JSON.stringify(input ?? "");
  const rewards: RewardKind[] = [];
  if (TEST_PATH_PATTERN.test(text)) rewards.push("tests-added");
  if (DOC_PATH_PATTERN.test(text)) rewards.push("docs-updated");
  return rewards;
}

function bestTurnReward(rewards: Set<RewardKind>) {
  if (rewards.has("tests-added")) return "tests-added";
  if (rewards.has("docs-updated")) return "docs-updated";
  return undefined;
}

function dayKey(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

function stringifyInputCommand(input: unknown) {
  if (typeof input === "object" && input && "command" in input) {
    const command = (input as { command?: unknown }).command;
    return typeof command === "string" ? command : "";
  }
  return "";
}
