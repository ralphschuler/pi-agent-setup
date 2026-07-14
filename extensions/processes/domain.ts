import fs from "node:fs/promises";
import { appendPrivateFile, atomicWritePrivateFile, withPrivateFileLock } from "../shared/private-storage.ts";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

export type LogWatch = {
  pattern: string;
  regex: RegExp;
  stream: "stdout" | "stderr" | "both";
  repeat: boolean;
  matched: boolean;
};

export type ManagedProcessStatus = "running" | "exited" | "killed";

export type ManagedProcess = {
  id: string;
  name: string;
  command: string;
  cwd: string;
  startedAt: number;
  status: ManagedProcessStatus;
  exitCode?: number | null;
  signal?: string | null;
  stdout: string[];
  stderr: string[];
  stdoutLog: string;
  stderrLog: string;
  alertOnSuccess: boolean;
  alertOnFailure: boolean;
  alertOnKill: boolean;
  logWatches: LogWatch[];
  child?: ChildProcessWithoutNullStreams;
};

export type SerializedManagedProcess = Omit<ManagedProcess, "child">;

export const DEFAULT_LOG_LIMIT = 400;

export function createManagedProcess(input: {
  id: string;
  name: string;
  command: string;
  cwd: string;
  stdoutLog: string;
  stderrLog: string;
  child: ChildProcessWithoutNullStreams;
  alertOnSuccess?: boolean;
  alertOnFailure?: boolean;
  alertOnKill?: boolean;
  logWatches?: unknown;
}): ManagedProcess {
  return {
    id: input.id,
    name: input.name,
    command: input.command,
    cwd: input.cwd,
    startedAt: Date.now(),
    status: "running",
    stdout: [],
    stderr: [],
    stdoutLog: input.stdoutLog,
    stderrLog: input.stderrLog,
    alertOnSuccess: Boolean(input.alertOnSuccess),
    alertOnFailure: Boolean(input.alertOnFailure),
    alertOnKill: Boolean(input.alertOnKill),
    logWatches: normalizeLogWatches(input.logWatches),
    child: input.child,
  };
}

export function appendOutput(
  proc: ManagedProcess,
  stream: "stdout" | "stderr",
  data: Buffer,
  options: { ui?: { notify?: (message: string, level: string) => void }; logLimit?: number; logFileLimit?: number } = {},
) {
  const text = data.toString();
  const lines = text.split(/\r?\n/).filter((line, index, arr) => line.length > 0 || index < arr.length - 1);
  proc[stream].push(...lines);
  const limit = options.logLimit ?? DEFAULT_LOG_LIMIT;
  if (proc[stream].length > limit) proc[stream].splice(0, proc[stream].length - limit);
  checkLogWatches(proc, stream, lines, options.ui);
  void appendBoundedLog(stream === "stdout" ? proc.stdoutLog : proc.stderrLog, text, options.logFileLimit);
}

export async function appendBoundedLog(
  file: string,
  text: string,
  logFileLimit = Number(process.env.PI_PROCESS_LOG_FILE_LIMIT || 1024 * 1024),
) {
  try {
    await withPrivateFileLock(file, async () => {
      await appendPrivateFile(file, text);
      const stat = await fs.stat(file);
      if (stat.size <= logFileLimit) return;
      const keep = Math.floor(logFileLimit * 0.8);
      const buffer = Buffer.alloc(keep);
      const handle = await fs.open(file, "r");
      try {
        await handle.read(buffer, 0, keep, stat.size - keep);
      } finally {
        await handle.close();
      }
      await atomicWritePrivateFile(file, `[log truncated to last ${keep} bytes]\n${buffer.toString("utf8")}`);
    });
  } catch {
    // Log persistence is best-effort; in-memory output remains available.
  }
}

export function normalizeLogWatches(value: unknown): LogWatch[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((watch) => watch && typeof watch === "object" && typeof (watch as { pattern?: unknown }).pattern === "string")
    .map((watch) => {
      const input = watch as { pattern: string; stream?: "stdout" | "stderr" | "both"; repeat?: boolean };
      if (!isSafeLogWatchPattern(input.pattern)) throw new Error(`Unsafe log watch regex "${input.pattern}"`);
      let regex: RegExp;
      try {
        regex = new RegExp(input.pattern);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid log watch regex "${input.pattern}": ${message}`, { cause: error });
      }
      return { pattern: input.pattern, regex, stream: input.stream || "both", repeat: Boolean(input.repeat), matched: false };
    });
}

export function isSafeLogWatchPattern(pattern: string) {
  if (pattern.length > 200) return false;
  if (/(\([^)]*[+*][^)]*\))[+*{]/.test(pattern)) return false;
  if (/(\[[^\]]*[+*][^\]]*\])[+*{]/.test(pattern)) return false;
  if (/(\.\*){2,}/.test(pattern)) return false;
  return true;
}

export function checkLogWatches(
  proc: ManagedProcess,
  stream: "stdout" | "stderr",
  lines: string[],
  ui?: { notify?: (message: string, level: string) => void },
) {
  if (!ui?.notify || lines.length === 0) return;
  const text = lines.join("\n");
  for (const watch of proc.logWatches) {
    if (watch.matched && !watch.repeat) continue;
    if (watch.stream !== "both" && watch.stream !== stream) continue;
    if (!watch.regex.test(text)) continue;
    watch.matched = true;
    ui.notify(`Process #${proc.id} (${proc.name}) matched ${stream} watch: ${watch.pattern}`, "warning");
  }
}

export function notifyProcessExit(proc: ManagedProcess, ui?: { notify?: (message: string, level: string) => void }) {
  if (!ui?.notify) return;
  if (proc.status === "killed" && proc.alertOnKill)
    ui.notify(`Process #${proc.id} (${proc.name}) was killed${proc.signal ? ` by ${proc.signal}` : ""}.`, "warning");
  if (proc.status === "exited" && proc.exitCode === 0 && proc.alertOnSuccess)
    ui.notify(`Process #${proc.id} (${proc.name}) completed successfully.`, "success");
  if (proc.status === "exited" && proc.exitCode !== 0 && proc.alertOnFailure)
    ui.notify(`Process #${proc.id} (${proc.name}) failed with exit code ${proc.exitCode ?? "?"}.`, "error");
}

export function serializeProcess(proc: ManagedProcess): SerializedManagedProcess {
  const { child: _child, ...rest } = proc;
  return rest;
}

export function safeProcessName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "process"
  );
}
