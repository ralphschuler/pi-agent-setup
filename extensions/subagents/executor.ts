// @ts-nocheck
import { spawn } from "node:child_process";
import { READ_ONLY_SUBAGENT_TOOLS } from "./plan-mode.ts";
import { textResult } from "./result.ts";

export function execSubagentProcess(
  agent: string,
  task: string,
  promptFile: string,
  cwd: string,
  index: number,
  signal?: AbortSignal,
  onUpdate?: (update: any) => void,
  readOnly = false,
  spawnFn = spawn,
  redactText: (text: string) => string = (text) => text,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const toolsArg = readOnly ? ` --tools ${READ_ONLY_SUBAGENT_TOOLS}` : "";
    const child = spawnFn("bash", ["-lc", `pi -p${toolsArg} < ${shellQuote(promptFile)}`], { cwd, stdio: "pipe", env: process.env });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const killTimer = setTimeout(() => child.kill("SIGTERM"), 10 * 60 * 1000);
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    const liveUpdate = createSubagentLiveUpdate(agent, task, index, stdout, stderr, onUpdate, redactText);

    child.stdout.on("data", (data) => {
      stdout.push(data.toString());
      trimChunks(stdout);
      liveUpdate();
    });
    child.stderr.on("data", (data) => {
      stderr.push(data.toString());
      trimChunks(stderr);
      liveUpdate();
    });
    child.on("error", (error) => {
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
      liveUpdate(true);
      resolve({ stdout: stdout.join(""), stderr: stderr.join(""), code });
    });
  });
}

export function createSubagentLiveUpdate(
  agent: string,
  task: string,
  index: number,
  stdout: string[],
  stderr: string[],
  onUpdate?: (update: any) => void,
  redactText: (text: string) => string = (text) => text,
) {
  let timer: NodeJS.Timeout | undefined;
  const emit = () => {
    timer = undefined;
    const tail = redactText(tailText([...stdout, ...stderr].join(""), 8, 4000));
    onUpdate?.(
      textResult(tail || `Running ${agent}...`, {
        action: "run",
        runs: [{ agent, task, ok: false, text: tail, index }],
        live: true,
        stdout: redactText(tailText(stdout.join(""), 6, 2000)),
        stderr: redactText(tailText(stderr.join(""), 6, 2000)),
      }),
    );
  };
  return (immediate = false) => {
    if (!onUpdate) return;
    if (immediate) {
      if (timer) clearTimeout(timer);
      emit();
      return;
    }
    if (!timer) timer = setTimeout(emit, 500);
  };
}

export function trimChunks(chunks: string[], max = 64) {
  if (chunks.length > max) chunks.splice(0, chunks.length - max);
}

export function tailText(text: string, maxLines: number, maxChars: number) {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(-maxLines).join("\n");
  return lines.length <= maxChars ? lines : `…${lines.slice(lines.length - maxChars)}`;
}

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
