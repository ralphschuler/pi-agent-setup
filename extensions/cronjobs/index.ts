import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { decodeStoredBlock, encodeStoredBlock, normalizeSingleLine } from "../shared/markdown-store-codec.ts";
import { renderPrettyToolResult } from "../shared/pretty-render.ts";
import { atomicWritePrivateFile, withPrivateFileLock } from "../shared/private-storage.ts";
import { computeNextRun, parseSchedule, refreshJobNextRun, type ScheduleKind } from "./domain.ts";
import { randomUUID } from "node:crypto";

const DEFAULT_STORE_PATH = join(homedir(), ".pi", "agent", "cronjobs.md");
const CHECK_INTERVAL_MS = 30_000;

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
  lastDispatchId?: string;
  dispatchStatus?: "pending" | "sent";
  dispatchAttempts?: number;
};

export type CronjobsOptions = { storePath?: string; now?: () => Date; retryDelayMs?: number };

export default function cronjobs(pi: ExtensionAPI, options: CronjobsOptions = {}) {
  const storePath = options.storePath || DEFAULT_STORE_PATH;
  const now = options.now || (() => new Date());
  const retryDelayMs = options.retryDelayMs ?? 60_000;
  let dispatching = false;
  let jobs: CronJob[] = [];
  let nextId = 1;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastCtx: ExtensionContext | undefined;

  async function loadStore() {
    try {
      const raw = await readFile(storePath, "utf8");
      jobs = parseMarkdown(raw);
      nextId = jobs.reduce((max, job) => Math.max(max, job.id), 0) + 1;
      refreshNextRuns();
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "ENOENT") console.warn(`[cronjobs] Failed to read ${storePath}:`, error);
      jobs = [];
      nextId = 1;
    }
  }

  async function saveStore() {
    await atomicWritePrivateFile(storePath, renderMarkdown(jobs));
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
    if (dispatching) return;
    dispatching = true;
    try {
      await withPrivateFileLock(storePath, async () => {
        await loadStore();
        for (const job of jobs) {
          const current = now();
          if (!job.enabled || !job.nextRunAt || Date.parse(job.nextRunAt) > current.getTime()) continue;

          const dispatchId = job.dispatchStatus === "pending" && job.lastDispatchId ? job.lastDispatchId : randomUUID();
          job.lastDispatchId = dispatchId;
          job.dispatchStatus = "pending";
          job.dispatchAttempts = (job.dispatchAttempts || 0) + 1;
          job.nextRunAt = current.toISOString();
          job.updatedAt = current.toISOString();
          await saveStore();

          try {
            await Promise.resolve(
              pi.sendUserMessage(
                [
                  {
                    type: "text",
                    text: `Run scheduled cronjob #${job.id}: ${job.name}\nDispatch: ${dispatchId}\nAttempt: ${job.dispatchAttempts}\n\n${job.task}`,
                  },
                ],
                { deliverAs: "followUp" },
              ),
            );
            job.lastRunAt = current.toISOString();
            job.dispatchStatus = "sent";
            if (job.kind === "once") {
              job.enabled = false;
              job.nextRunAt = undefined;
            } else {
              job.nextRunAt = computeNextRun(job, new Date(current.getTime() + 1000))?.toISOString();
            }
          } catch (error) {
            job.nextRunAt = new Date(current.getTime() + retryDelayMs).toISOString();
            console.warn(`[cronjobs] Dispatch ${dispatchId} failed; retry scheduled:`, error);
          }
          job.updatedAt = now().toISOString();
          await saveStore();
        }
      });
    } finally {
      dispatching = false;
      updateUi();
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    lastCtx = ctx;
    await loadStore();
    startTimer();
    await runDueJobs();
    updateUi(ctx);
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  });

  pi.on("before_agent_start", async (event) => {
    await loadStore();
    return {
      systemPrompt: `${event.systemPrompt}\n\n<cronjobs>\n${instructions(storePath)}\n${formatActiveJobsForPrompt()}\n</cronjobs>`,
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
    renderResult: renderPrettyToolResult("cronjob"),
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
        const nowIso = now().toISOString();
        const job: CronJob = {
          id: nextId++,
          name: safeSingleLine(params.name.trim()),
          task: params.task.trim(),
          schedule: params.schedule.trim(),
          kind: parsed.kind,
          enabled: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        job.nextRunAt = computeNextRun(job, now())?.toISOString();
        jobs.push(job);
        sortJobs();
        await saveStore();
        updateUi(ctx);
        return textResult(`Scheduled cronjob #${job.id}: ${job.name}\nNext run: ${job.nextRunAt ?? "never"}\n\n${formatJobs()}`, {
          jobs,
          storePath,
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
          { jobs, storePath },
        );
      }

      if (params.action === "enable" || params.action === "disable") {
        if (!Number.isInteger(params.id)) return errorResult(`${params.action} requires id`);
        const job = jobs.find((candidate) => candidate.id === params.id);
        if (!job) return textResult(`Cronjob #${params.id} not found.`, { jobs, storePath });
        job.enabled = params.action === "enable";
        job.updatedAt = now().toISOString();
        job.nextRunAt = job.enabled ? refreshJobNextRun(job, now())?.toISOString() : undefined;
        await saveStore();
        updateUi(ctx);
        return textResult(`${params.action === "enable" ? "Enabled" : "Disabled"} cronjob #${job.id}.\n\n${formatJobs()}`, {
          jobs,
          storePath,
        });
      }

      if (params.action === "run_due") {
        await runDueJobs();
        return textResult(`Checked due cronjobs.\n\n${formatJobs()}`, { jobs, storePath });
      }

      return textResult(formatJobs(), { jobs, storePath });
    },
  });

  function refreshNextRuns() {
    const current = now();
    for (const job of jobs) job.nextRunAt = refreshJobNextRun(job, current)?.toISOString();
    sortJobs();
  }

  function sortJobs() {
    jobs.sort((a, b) => (a.nextRunAt || "~").localeCompare(b.nextRunAt || "~") || a.id - b.id);
  }

  function formatJobs() {
    if (jobs.length === 0) return `No cronjobs scheduled.\n\nStore: ${storePath}`;
    return [
      "Cronjobs:",
      ...jobs.map(
        (job) => `- #${job.id} ${job.enabled ? "enabled" : "disabled"} ${job.name} — ${job.schedule} — next: ${job.nextRunAt || "none"}`,
      ),
      "",
      `Store: ${storePath}`,
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

function instructions(storePath = DEFAULT_STORE_PATH) {
  return [
    "Cronjobs are your durable scheduler for future or recurring agent work.",
    `Storage: ${storePath}`,
    "Use the cronjob tool to schedule reminders, follow-ups, periodic checks, recurring maintenance, or delayed tasks requested by the user.",
    "Supported schedules: ISO date/time, 'every <n> minutes|hours|days', 'daily HH:MM', and simple 5-field cron expressions.",
    "When a job is due, its task is sent back to pi as a user message for the agent to execute.",
  ].join("\n");
}

export function parseMarkdown(markdown: string): CronJob[] {
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
        else if (line.startsWith("- dispatchId: ")) job.lastDispatchId = emptyToUndefined(line.slice(14).trim());
        else if (line.startsWith("- dispatchStatus: "))
          job.dispatchStatus = emptyToUndefined(line.slice(18).trim()) as CronJob["dispatchStatus"];
        else if (line.startsWith("- dispatchAttempts: ")) job.dispatchAttempts = Number(line.slice(20).trim()) || undefined;
        else if (line === "### Task") inTask = true;
        else if (inTask) task.push(line);
      }
      job.task = decodeStoredBlock(task.join("\n").trim());
      const parsed = parseSchedule(job.schedule);
      if (parsed) job.kind = parsed.kind;
      return job;
    })
    .filter((job) => Number.isInteger(job.id) && job.task);
}

export function renderMarkdown(jobs: CronJob[]) {
  const lines = ["# Cronjobs", "", "<!-- Managed by the pi cronjob extension. Scheduled task bodies are sent back to pi when due. -->", ""];
  for (const job of jobs) {
    lines.push(`## Job ${job.id}`);
    lines.push(`- name: ${safeSingleLine(job.name)}`);
    lines.push(`- schedule: ${job.schedule}`);
    lines.push(`- kind: ${job.kind}`);
    lines.push(`- enabled: ${job.enabled}`);
    lines.push(`- created: ${job.createdAt}`);
    lines.push(`- updated: ${job.updatedAt}`);
    lines.push(`- lastRun: ${job.lastRunAt || ""}`);
    lines.push(`- nextRun: ${job.nextRunAt || ""}`);
    lines.push(`- dispatchId: ${job.lastDispatchId || ""}`);
    lines.push(`- dispatchStatus: ${job.dispatchStatus || ""}`);
    lines.push(`- dispatchAttempts: ${job.dispatchAttempts || ""}`);
    lines.push("");
    lines.push("### Task");
    lines.push(encodeStoredBlock(job.task));
    lines.push("");
  }
  return lines.join("\n");
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString();
}

function safeSingleLine(value: string) {
  return normalizeSingleLine(value);
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

function errorResult(text: string, storePath = DEFAULT_STORE_PATH) {
  return { content: [{ type: "text" as const, text }], isError: true, details: { error: text, storePath } };
}
