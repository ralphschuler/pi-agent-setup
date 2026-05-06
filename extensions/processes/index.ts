import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { appendOutput, createManagedProcess, notifyProcessExit, safeProcessName, serializeProcess, type ManagedProcess } from "./domain.ts";
import { matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { renderToolDisplayContract, singleLine } from "../shared/pretty-render.ts";

type ProcessDetails = {
  action: string;
  process?: Omit<ManagedProcess, "child">;
  processes?: Omit<ManagedProcess, "child">[];
  stdout?: string[];
  stderr?: string[];
  stdoutLog?: string;
  stderrLog?: string;
  cleared?: number;
  ended?: boolean;
};

const processes = new Map<string, ManagedProcess>();
let nextId = 1;
const LOG_FILE_LIMIT = Number(process.env.PI_PROCESS_LOG_FILE_LIMIT || 1024 * 1024);

const actionSchema = Type.Union([
  Type.Literal("start"),
  Type.Literal("list"),
  Type.Literal("output"),
  Type.Literal("logs"),
  Type.Literal("kill"),
  Type.Literal("clear"),
  Type.Literal("write"),
]);

class ProcessListComponent {
  private theme: Theme;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(theme: Theme, onClose: () => void) {
    this.theme = theme;
    this.onClose = onClose;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) this.onClose();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    const th = this.theme;
    const all = [...processes.values()];
    const running = all.filter((proc) => proc.status === "running").length;
    const lines: string[] = [""];
    lines.push(
      truncateToWidth(
        `${th.fg("borderMuted", "──")} ${th.fg("accent", th.bold("Processes"))} ${th.fg("muted", `${running} running / ${all.length} total`)}`,
        width,
      ),
    );
    lines.push("");
    if (all.length === 0) {
      lines.push(truncateToWidth(`  ${th.fg("dim", "No managed processes.")}`, width));
    } else {
      for (const proc of all) {
        const icon =
          proc.status === "running" ? th.fg("success", "●") : proc.status === "killed" ? th.fg("warning", "■") : th.fg("dim", "○");
        const name = th.fg("accent", `#${proc.id} ${proc.name}`);
        const status = statusText(proc, th);
        lines.push(truncateToWidth(`  ${icon} ${name} ${status}`, width));
        lines.push(truncateToWidth(`     ${th.fg("dim", proc.command)}`, width));
        const last = [...proc.stderr.slice(-1), ...proc.stdout.slice(-1)].pop();
        if (last) lines.push(truncateToWidth(`     ${th.fg("muted", last)}`, width));
      }
    }
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

export default function processesExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "process",
    label: "Process",
    description: "Custom background process manager for dev servers, watchers, builds, and logs.",
    promptSnippet: "Start and manage long-running commands without blocking the agent turn.",
    promptGuidelines: [
      "Use process for long-running commands such as dev servers, watchers, build watchers, local APIs, and log tails.",
      "Use process output or logs to inspect a managed process instead of polling shell background jobs.",
    ],
    parameters: Type.Object({
      action: actionSchema,
      name: Type.Optional(Type.String({ description: "Friendly process name for start." })),
      command: Type.Optional(Type.String({ description: "Shell command to run for start." })),
      id: Type.Optional(Type.String({ description: "Process id for output/logs/kill/write." })),
      input: Type.Optional(Type.String({ description: "Text to write to stdin for write." })),
      end: Type.Optional(Type.Boolean({ description: "Close stdin after writing." })),
      alertOnSuccess: Type.Optional(Type.Boolean()),
      alertOnFailure: Type.Optional(Type.Boolean()),
      alertOnKill: Type.Optional(Type.Boolean()),
      logWatches: Type.Optional(
        Type.Array(
          Type.Object({
            pattern: Type.String(),
            stream: Type.Optional(Type.Union([Type.Literal("stdout"), Type.Literal("stderr"), Type.Literal("both")])),
            repeat: Type.Optional(Type.Boolean()),
          }),
        ),
      ),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx): Promise<any> {
      try {
        switch (params.action) {
          case "start":
            return await startProcess(params, ctx.cwd, onUpdate, ctx.ui);
          case "list":
            return textResult(formatList(), { action: "list", processes: serializeAll() });
          case "output":
            return outputFor(requiredProcess(params.id));
          case "logs":
            return logsFor(requiredProcess(params.id));
          case "kill":
            return killProcess(requiredProcess(params.id), ctx.ui);
          case "clear":
            return clearFinished(ctx.ui);
          case "write":
            return writeInput(requiredProcess(params.id), params.input ?? "", Boolean(params.end));
        }
      } catch (error) {
        return textResult(error instanceof Error ? error.message : String(error), { action: "error" }, true);
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("process ")) + theme.fg("accent", args.action);
      if (args.name) text += ` ${theme.fg("muted", args.name)}`;
      if (args.id) text += ` ${theme.fg("accent", `#${args.id}`)}`;
      if (args.command) text += ` ${theme.fg("dim", trimLine(args.command, 80))}`;
      return new Text(text, 0, 0);
    },

    renderResult(result: any, { expanded, isPartial }, theme) {
      return renderToolDisplayContract(processDisplayContract(result, Boolean(expanded), Boolean(isPartial)), theme);
    },
  });

  pi.registerCommand("ps", {
    description: "Show custom managed background processes",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return ctx.ui.notify(formatList(), "info");
      await ctx.ui.custom<void>((_tui, theme, _kb, done) => new ProcessListComponent(theme, () => done()));
    },
  });

  pi.on("session_start", async (_event, ctx) => updateProcessStatus(ctx.ui));
  pi.on("session_shutdown", async () => {
    for (const proc of processes.values()) {
      if (proc.status === "running") proc.child?.kill("SIGTERM");
    }
  });
}

async function startProcess(params: any, cwd: string, onUpdate?: (update: any) => void, ui?: any) {
  if (!params.name?.trim()) throw new Error("process start requires name.");
  if (!params.command?.trim()) throw new Error("process start requires command.");
  const id = String(nextId++);
  const logDir = path.join(os.tmpdir(), "pi-processes");
  await fs.mkdir(logDir, { recursive: true });
  const stdoutLog = path.join(logDir, `${id}-${safeProcessName(params.name)}.stdout.log`);
  const stderrLog = path.join(logDir, `${id}-${safeProcessName(params.name)}.stderr.log`);
  await fs.writeFile(stdoutLog, "", "utf8");
  await fs.writeFile(stderrLog, "", "utf8");

  const child = spawn(params.command, { cwd, shell: true, stdio: "pipe", env: process.env });
  const proc = createManagedProcess({
    id,
    name: params.name,
    command: params.command,
    cwd,
    stdoutLog,
    stderrLog,
    alertOnSuccess: params.alertOnSuccess,
    alertOnFailure: params.alertOnFailure,
    alertOnKill: params.alertOnKill,
    logWatches: params.logWatches,
    child,
  });
  processes.set(id, proc);

  const liveUpdate = createThrottledLiveUpdate(proc, onUpdate);
  child.stdout.on("data", (data) => {
    appendOutput(proc, "stdout", data, { ui, logFileLimit: LOG_FILE_LIMIT });
    liveUpdate("stdout");
  });
  child.stderr.on("data", (data) => {
    appendOutput(proc, "stderr", data, { ui, logFileLimit: LOG_FILE_LIMIT });
    liveUpdate("stderr");
  });
  child.on("exit", (code, signal) => {
    proc.status = signal ? "killed" : "exited";
    proc.exitCode = code;
    proc.signal = signal;
    liveUpdate("exit", true);
    notifyProcessExit(proc, ui);
    updateProcessStatus(ui);
  });
  child.on("error", (error) => {
    appendOutput(proc, "stderr", Buffer.from(`${error.message}\n`), { ui, logFileLimit: LOG_FILE_LIMIT });
    liveUpdate("stderr", true);
  });

  updateProcessStatus(ui);
  onUpdate?.(processLiveResult(proc, "start"));
  return textResult(`Started process #${id} (${params.name}).`, { action: "start", process: serializeProcess(proc) });
}

export { isSafeLogWatchPattern } from "./domain.ts";

function requiredProcess(id?: string) {
  if (!id) throw new Error("Process id is required.");
  const proc = processes.get(id);
  if (!proc) throw new Error(`No managed process with id ${id}.`);
  return proc;
}

function outputFor(proc: ManagedProcess) {
  return textResult(
    [
      `#${proc.id} ${proc.name} — ${proc.status}`,
      proc.stdout.length ? `\nstdout:\n${proc.stdout.join("\n")}` : "\nstdout: <empty>",
      proc.stderr.length ? `\nstderr:\n${proc.stderr.join("\n")}` : "\nstderr: <empty>",
    ].join("\n"),
    { action: "output", process: serializeProcess(proc), stdout: proc.stdout, stderr: proc.stderr },
  );
}

function logsFor(proc: ManagedProcess) {
  return textResult(`stdout: ${proc.stdoutLog}\nstderr: ${proc.stderrLog}`, {
    action: "logs",
    process: serializeProcess(proc),
    stdoutLog: proc.stdoutLog,
    stderrLog: proc.stderrLog,
  });
}

function killProcess(proc: ManagedProcess, ui?: any) {
  if (proc.status !== "running")
    return textResult(`Process #${proc.id} is already ${proc.status}.`, { action: "kill", process: serializeProcess(proc) });
  proc.child?.kill("SIGTERM");
  proc.status = "killed";
  updateProcessStatus(ui);
  return textResult(`Sent SIGTERM to process #${proc.id} (${proc.name}).`, { action: "kill", process: serializeProcess(proc) });
}

function clearFinished(ui?: any) {
  let count = 0;
  for (const [id, proc] of processes) {
    if (proc.status !== "running") {
      processes.delete(id);
      count++;
    }
  }
  updateProcessStatus(ui);
  return textResult(`Cleared ${count} finished process(es).`, { action: "clear", cleared: count });
}

function writeInput(proc: ManagedProcess, input: string, end: boolean) {
  if (proc.status !== "running" || !proc.child) throw new Error(`Process #${proc.id} is not running.`);
  proc.child.stdin.write(input);
  if (end) proc.child.stdin.end();
  return textResult(`Wrote ${input.length} byte(s) to process #${proc.id}.`, {
    action: "write",
    process: serializeProcess(proc),
    ended: end,
  });
}

function formatList() {
  const rows = [...processes.values()].map((proc) => `#${proc.id} ${proc.name} — ${proc.status} — ${proc.command}`);
  return rows.length ? rows.join("\n") : "No managed processes.";
}

function serializeAll() {
  return [...processes.values()].map(serializeProcess);
}

function textResult(text: string, details: ProcessDetails | Record<string, unknown> = {}, isError = false) {
  return { content: [{ type: "text" as const, text }], details, isError };
}

function createThrottledLiveUpdate(proc: ManagedProcess, onUpdate?: (update: any) => void) {
  let timer: NodeJS.Timeout | undefined;
  let lastStream: "stdout" | "stderr" | "start" | "exit" = "start";
  const emit = () => {
    timer = undefined;
    onUpdate?.(processLiveResult(proc, lastStream));
  };
  return (stream: "stdout" | "stderr" | "exit", immediate = false) => {
    lastStream = stream;
    if (!onUpdate) return;
    if (immediate) {
      if (timer) clearTimeout(timer);
      emit();
      return;
    }
    if (!timer) timer = setTimeout(emit, 250);
  };
}

function processLiveResult(proc: ManagedProcess, stream: "stdout" | "stderr" | "start" | "exit") {
  const stdout = proc.stdout.slice(-4);
  const stderr = proc.stderr.slice(-4);
  const live = [
    `Process #${proc.id} ${proc.name} — ${proc.status}`,
    stdout.length ? `stdout:\n${stdout.join("\n")}` : undefined,
    stderr.length ? `stderr:\n${stderr.join("\n")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
  return textResult(live, { action: "start", process: serializeProcess(proc), stdout, stderr, stream, live: true });
}

function processDisplayContract(result: any, expanded: boolean, isPartial: boolean) {
  const details = result.details as ProcessDetails | undefined;
  if (result.isError) return { title: textFromResult(result), titleTone: "error" as const };
  if (!details) return { title: textFromResult(result) };
  if (details.process) {
    const proc = details.process;
    const showLive = isPartial;
    const stdout = details.stdout || [];
    const stderr = details.stderr || [];
    return {
      title: `${statusGlyph(proc.status)} #${proc.id} ${proc.name} ${statusLabel(proc)}`,
      titleTone: statusTone(proc.status, proc.exitCode),
      summary: singleLine(proc.command, 120),
      sections: [
        (expanded || showLive) && stdout.length
          ? { title: showLive ? "stdout (live):" : "stdout:", titleTone: "muted" as const, lines: stdout, maxLines: showLive ? 4 : 20 }
          : undefined,
        (expanded || showLive) && stderr.length
          ? { title: showLive ? "stderr (live):" : "stderr:", titleTone: "warning" as const, lines: stderr, maxLines: showLive ? 4 : 20 }
          : undefined,
      ].filter(Boolean),
    };
  }
  if (details.processes) {
    const running = details.processes.filter((proc) => proc.status === "running").length;
    const shown = expanded ? details.processes : details.processes.slice(0, 8);
    return {
      title: `${running} running / ${details.processes.length} total`,
      titleTone: "accent" as const,
      lines: shown.map((proc) => ({
        text: `${statusGlyph(proc.status)} #${proc.id} ${proc.name} ${singleLine(proc.command, 70)}`,
        tone: statusTone(proc.status, proc.exitCode),
      })),
      footer: !expanded && details.processes.length > shown.length ? `… ${details.processes.length - shown.length} more` : undefined,
    };
  }
  return { title: textFromResult(result), titleTone: "success" as const };
}

function updateProcessStatus(ui?: any) {
  if (!ui?.setStatus) return;
  const running = [...processes.values()].filter((proc) => proc.status === "running").length;
  ui.setStatus("processes", running ? `processes: ${running} running` : undefined);
}

function statusText(proc: Pick<ManagedProcess, "status" | "exitCode" | "signal">, theme: Theme) {
  if (proc.status === "running") return theme.fg("success", "running");
  if (proc.status === "killed") return theme.fg("warning", `killed${proc.signal ? ` (${proc.signal})` : ""}`);
  return proc.exitCode === 0 ? theme.fg("success", "exited 0") : theme.fg("error", `exited ${proc.exitCode ?? "?"}`);
}

function statusGlyph(status: ManagedProcess["status"]) {
  if (status === "running") return "●";
  if (status === "killed") return "■";
  return "○";
}

function statusLabel(proc: Pick<ManagedProcess, "status" | "exitCode" | "signal">) {
  if (proc.status === "running") return "running";
  if (proc.status === "killed") return `killed${proc.signal ? ` (${proc.signal})` : ""}`;
  return proc.exitCode === 0 ? "exited 0" : `exited ${proc.exitCode ?? "?"}`;
}

function statusTone(status: ManagedProcess["status"], exitCode?: number | null) {
  if (status === "running") return "success" as const;
  if (status === "killed") return "warning" as const;
  return exitCode === 0 ? ("success" as const) : ("error" as const);
}

function textFromResult(result: any) {
  const first = result.content?.[0];
  return first?.type === "text" ? first.text : "";
}

function trimLine(text: string, max: number) {
  return singleLine(text, max);
}
