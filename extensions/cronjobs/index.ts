import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const STORE_PATH = join(homedir(), ".pi", "agent", "cronjobs.md");
const CHECK_INTERVAL_MS = 30_000;

type ScheduleKind = "once" | "every" | "daily" | "cron";

type CronJob = {
  id: number;
  name: string;
  task: string;
  schedule: string;
  kind: ScheduleKind;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
};

export default function cronjobs(pi: ExtensionAPI) {
  let jobs: CronJob[] = [];
  let nextId = 1;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastCtx: ExtensionContext | undefined;

  async function loadStore() {
    try {
      const raw = await readFile(STORE_PATH, "utf8");
      jobs = parseMarkdown(raw);
      nextId = jobs.reduce((max, job) => Math.max(max, job.id), 0) + 1;
      refreshNextRuns();
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "ENOENT") console.warn(`[cronjobs] Failed to read ${STORE_PATH}:`, error);
      jobs = [];
      nextId = 1;
    }
  }

  async function saveStore() {
    await mkdir(dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, renderMarkdown(jobs), "utf8");
  }

  function updateUi(ctx = lastCtx) {
    if (!ctx?.hasUI) return;
    const enabled = jobs.filter((job) => job.enabled).length;
    ctx.ui.setStatus("cronjobs", enabled > 0 ? `cron: ${enabled}` : undefined);
    const dueSoon = jobs
      .filter((job) => job.enabled && job.nextRunAt)
      .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))
      .slice(0, 5);
    ctx.ui.setWidget(
      "cronjobs",
      dueSoon.length > 0 ? ["Cronjobs", ...dueSoon.map((job) => `#${job.id} ${job.name} → ${formatWhen(job.nextRunAt!)}`)] : [],
    );
  }

  function startTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => void runDueJobs(), CHECK_INTERVAL_MS);
  }

  async function runDueJobs() {
    const now = new Date();
    let changed = false;
    for (const job of jobs) {
      if (!job.enabled || !job.nextRunAt) continue;
      if (Date.parse(job.nextRunAt) > now.getTime()) continue;

      job.lastRunAt = now.toISOString();
      if (job.kind === "once") {
        job.enabled = false;
        job.nextRunAt = undefined;
      } else {
        job.nextRunAt = computeNextRun(job, new Date(now.getTime() + 1000))?.toISOString();
      }
      job.updatedAt = now.toISOString();
      changed = true;

      pi.sendUserMessage([{ type: "text", text: `Run scheduled cronjob #${job.id}: ${job.name}\n\n${job.task}` }], {
        deliverAs: "followUp",
      });
    }

    if (changed) {
      await saveStore();
      updateUi();
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    lastCtx = ctx;
    await loadStore();
    startTimer();
    updateUi(ctx);
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  });

  pi.on("before_agent_start", async (event) => {
    await loadStore();
    return {
      systemPrompt: `${event.systemPrompt}\n\n<cronjobs>\n${instructions()}\n${formatActiveJobsForPrompt()}\n</cronjobs>`,
    };
  });

  pi.registerTool({
    name: "cronjob",
    label: "Cronjob",
    description: "Agent-facing persistent scheduler for one-shot and recurring tasks. Scheduled jobs dispatch back into pi when due.",
    promptSnippet: "Schedule durable future or recurring agent tasks.",
    promptGuidelines: [
      "Use cronjob when the user asks to remind, check, run, monitor, or follow up later or on a recurring schedule.",
      "Use human_in_loop before scheduling if timing, recurrence, or task wording is ambiguous.",
      "Keep scheduled task prompts specific and actionable because they will be sent back to the agent when due.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("schedule"),
        Type.Literal("list"),
        Type.Literal("cancel"),
        Type.Literal("enable"),
        Type.Literal("disable"),
        Type.Literal("run_due"),
      ]),
      name: Type.Optional(Type.String({ description: "Short job name for action=schedule" })),
      task: Type.Optional(Type.String({ description: "Prompt/task to send to the agent when the job runs" })),
      schedule: Type.Optional(
        Type.String({ description: "Schedule expression: ISO date, every <n> minutes|hours|days, daily HH:MM, or 5-field cron" }),
      ),
      id: Type.Optional(Type.Number({ description: "Job id for cancel/enable/disable" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      lastCtx = ctx;
      await loadStore();

      if (params.action === "schedule") {
        if (!params.name?.trim() || !params.task?.trim() || !params.schedule?.trim()) {
          return errorResult("schedule requires name, task, and schedule");
        }
        const parsed = parseSchedule(params.schedule.trim());
        if (!parsed) return errorResult(`Unsupported schedule: ${params.schedule}`);
        const now = new Date().toISOString();
        const job: CronJob = {
          id: nextId++,
          name: params.name.trim(),
          task: params.task.trim(),
          schedule: params.schedule.trim(),
          kind: parsed.kind,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };
        job.nextRunAt = computeNextRun(job, new Date())?.toISOString();
        jobs.push(job);
        sortJobs();
        await saveStore();
        updateUi(ctx);
        return textResult(`Scheduled cronjob #${job.id}: ${job.name}\nNext run: ${job.nextRunAt ?? "never"}\n\n${formatJobs()}`, {
          jobs,
          storePath: STORE_PATH,
        });
      }

      if (params.action === "cancel") {
        if (!Number.isInteger(params.id)) return errorResult("cancel requires id");
        const before = jobs.length;
        jobs = jobs.filter((job) => job.id !== params.id);
        await saveStore();
        updateUi(ctx);
        return textResult(
          before === jobs.length ? `Cronjob #${params.id} not found.` : `Cancelled cronjob #${params.id}.\n\n${formatJobs()}`,
          { jobs, storePath: STORE_PATH },
        );
      }

      if (params.action === "enable" || params.action === "disable") {
        if (!Number.isInteger(params.id)) return errorResult(`${params.action} requires id`);
        const job = jobs.find((candidate) => candidate.id === params.id);
        if (!job) return textResult(`Cronjob #${params.id} not found.`, { jobs, storePath: STORE_PATH });
        job.enabled = params.action === "enable";
        job.updatedAt = new Date().toISOString();
        job.nextRunAt = job.enabled ? computeNextRun(job, new Date())?.toISOString() : undefined;
        await saveStore();
        updateUi(ctx);
        return textResult(`${params.action === "enable" ? "Enabled" : "Disabled"} cronjob #${job.id}.\n\n${formatJobs()}`, {
          jobs,
          storePath: STORE_PATH,
        });
      }

      if (params.action === "run_due") {
        await runDueJobs();
        return textResult(`Checked due cronjobs.\n\n${formatJobs()}`, { jobs, storePath: STORE_PATH });
      }

      return textResult(formatJobs(), { jobs, storePath: STORE_PATH });
    },
  });

  function refreshNextRuns() {
    const now = new Date();
    for (const job of jobs) {
      if (!job.enabled) continue;
      const next = computeNextRun(job, now);
      job.nextRunAt = next?.toISOString();
    }
    sortJobs();
  }

  function sortJobs() {
    jobs.sort((a, b) => (a.nextRunAt || "~").localeCompare(b.nextRunAt || "~") || a.id - b.id);
  }

  function formatJobs() {
    if (jobs.length === 0) return `No cronjobs scheduled.\n\nStore: ${STORE_PATH}`;
    return [
      "Cronjobs:",
      ...jobs.map(
        (job) => `- #${job.id} ${job.enabled ? "enabled" : "disabled"} ${job.name} — ${job.schedule} — next: ${job.nextRunAt || "none"}`,
      ),
      "",
      `Store: ${STORE_PATH}`,
    ].join("\n");
  }

  function formatActiveJobsForPrompt() {
    const active = jobs.filter((job) => job.enabled);
    if (active.length === 0) return "No active cronjobs.";
    return [
      "Active cronjobs:",
      ...active
        .slice(0, 10)
        .map((job) => `- #${job.id} ${job.name}: ${job.schedule}; next=${job.nextRunAt || "unknown"}; task=${oneLine(job.task)}`),
    ].join("\n");
  }
}

function instructions() {
  return [
    "Cronjobs are your durable scheduler for future or recurring agent work.",
    `Storage: ${STORE_PATH}`,
    "Use the cronjob tool to schedule reminders, follow-ups, periodic checks, recurring maintenance, or delayed tasks requested by the user.",
    "Supported schedules: ISO date/time, 'every <n> minutes|hours|days', 'daily HH:MM', and simple 5-field cron expressions.",
    "When a job is due, its task is sent back to pi as a user message for the agent to execute.",
  ].join("\n");
}

function parseSchedule(value: string): { kind: ScheduleKind } | undefined {
  const lower = value.toLowerCase().trim();
  if (!Number.isNaN(Date.parse(value))) return { kind: "once" };
  if (/^every\s+\d+\s+(minute|minutes|hour|hours|day|days)$/.test(lower)) return { kind: "every" };
  if (/^daily\s+([01]?\d|2[0-3]):[0-5]\d$/.test(lower)) return { kind: "daily" };
  if (lower.split(/\s+/).length === 5 && lower.split(/\s+/).every(isCronField)) return { kind: "cron" };
  return undefined;
}

function computeNextRun(job: CronJob, from: Date) {
  if (job.kind === "once") {
    const date = new Date(job.schedule);
    return date.getTime() >= from.getTime() ? date : undefined;
  }

  const lower = job.schedule.toLowerCase().trim();
  const every = lower.match(/^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/);
  if (every) {
    const amount = Number(every[1]);
    const unit = every[2];
    const base = job.lastRunAt ? new Date(job.lastRunAt) : from;
    const ms = unit.startsWith("minute") ? amount * 60_000 : unit.startsWith("hour") ? amount * 3_600_000 : amount * 86_400_000;
    const next = new Date(base.getTime() + ms);
    while (next.getTime() < from.getTime()) next.setTime(next.getTime() + ms);
    return next;
  }

  const daily = lower.match(/^daily\s+([01]?\d|2[0-3]):([0-5]\d)$/);
  if (daily) {
    const next = new Date(from);
    next.setSeconds(0, 0);
    next.setHours(Number(daily[1]), Number(daily[2]), 0, 0);
    if (next.getTime() < from.getTime()) next.setDate(next.getDate() + 1);
    return next;
  }

  return nextCronRun(job.schedule, from);
}

function nextCronRun(expression: string, from: Date) {
  const fields = expression.trim().split(/\s+/);
  for (let i = 1; i <= 525_600; i++) {
    const candidate = new Date(from.getTime() + i * 60_000);
    candidate.setSeconds(0, 0);
    if (
      matchesCronField(fields[0], candidate.getMinutes(), 0, 59) &&
      matchesCronField(fields[1], candidate.getHours(), 0, 23) &&
      matchesCronField(fields[2], candidate.getDate(), 1, 31) &&
      matchesCronField(fields[3], candidate.getMonth() + 1, 1, 12) &&
      matchesCronField(fields[4], candidate.getDay(), 0, 6)
    )
      return candidate;
  }
  return undefined;
}

function isCronField(field: string) {
  return field.split(",").every((part) => part === "*" || /^\d+$/.test(part) || /^\*\/\d+$/.test(part) || /^\d+-\d+$/.test(part));
}

function matchesCronField(field: string, value: number, min: number, max: number) {
  return field.split(",").some((part) => {
    if (part === "*") return true;
    if (part.startsWith("*/")) return value % Number(part.slice(2)) === 0;
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      return value >= start && value <= end;
    }
    const number = Number(part);
    return number >= min && number <= max && value === number;
  });
}

function parseMarkdown(markdown: string): CronJob[] {
  const blocks = markdown.split(/^## Job /m).slice(1);
  return blocks
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const header = lines.shift() || "0";
      const id = Number(header.trim());
      const job: CronJob = {
        id,
        name: "Untitled",
        task: "",
        schedule: "every 1 day",
        kind: "every",
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const task: string[] = [];
      let inTask = false;
      for (const line of lines) {
        if (line.startsWith("- name: ")) job.name = line.slice(8).trim();
        else if (line.startsWith("- schedule: ")) job.schedule = line.slice(12).trim();
        else if (line.startsWith("- kind: ")) job.kind = line.slice(8).trim() as ScheduleKind;
        else if (line.startsWith("- enabled: ")) job.enabled = line.slice(11).trim() === "true";
        else if (line.startsWith("- created: ")) job.createdAt = line.slice(11).trim();
        else if (line.startsWith("- updated: ")) job.updatedAt = line.slice(11).trim();
        else if (line.startsWith("- lastRun: ")) job.lastRunAt = emptyToUndefined(line.slice(11).trim());
        else if (line.startsWith("- nextRun: ")) job.nextRunAt = emptyToUndefined(line.slice(11).trim());
        else if (line === "### Task") inTask = true;
        else if (inTask) task.push(line);
      }
      job.task = task.join("\n").trim();
      const parsed = parseSchedule(job.schedule);
      if (parsed) job.kind = parsed.kind;
      return job;
    })
    .filter((job) => Number.isInteger(job.id) && job.task);
}

function renderMarkdown(jobs: CronJob[]) {
  const lines = ["# Cronjobs", "", "<!-- Managed by the pi cronjob extension. Scheduled task bodies are sent back to pi when due. -->", ""];
  for (const job of jobs) {
    lines.push(`## Job ${job.id}`);
    lines.push(`- name: ${job.name}`);
    lines.push(`- schedule: ${job.schedule}`);
    lines.push(`- kind: ${job.kind}`);
    lines.push(`- enabled: ${job.enabled}`);
    lines.push(`- created: ${job.createdAt}`);
    lines.push(`- updated: ${job.updatedAt}`);
    lines.push(`- lastRun: ${job.lastRunAt || ""}`);
    lines.push(`- nextRun: ${job.nextRunAt || ""}`);
    lines.push("");
    lines.push("### Task");
    lines.push(job.task);
    lines.push("");
  }
  return lines.join("\n");
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString();
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 120) || "No task.";
}

function emptyToUndefined(value: string) {
  return value || undefined;
}

function textResult(text: string, details: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text }], details };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true, details: { error: text, storePath: STORE_PATH } };
}
