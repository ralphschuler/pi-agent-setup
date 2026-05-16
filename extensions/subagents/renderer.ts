import { Text } from "@mariozechner/pi-tui";
import type { ToolDisplayContract, ToolDisplayLine, ToolDisplayTone } from "../shared/pretty-render.ts";
import { renderToolDisplayContract, singleLine } from "../shared/pretty-render.ts";
import { textFromResult } from "./result.ts";
import type { RunRecord, ToolResult } from "./types.ts";

type Theme = {
  bold(text: string): string;
  fg(tone: string, text: string): string;
};

type SubagentCallArgs = {
  action?: string;
  tasks?: unknown[];
  agent?: string;
};

type RenderOptions = {
  expanded?: boolean;
  isPartial?: boolean;
};

type SubagentResultDetails = {
  runs?: RunRecord[];
};

type SubagentToolResult = ToolResult & {
  details?: SubagentResultDetails;
};

function isRunRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<RunRecord>;
  return typeof run.agent === "string" && typeof run.task === "string" && typeof run.ok === "boolean" && typeof run.text === "string";
}

function runsFromResult(result: SubagentToolResult): RunRecord[] | undefined {
  const runs = result.details?.runs;
  return Array.isArray(runs) && runs.every(isRunRecord) ? runs : undefined;
}

export function renderSubagentCall(args: SubagentCallArgs = {}, theme: Theme) {
  const action = args.action || (args.tasks ? "parallel" : "run");
  const label = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", action);
  if (args.tasks) return new Text(`${label} ${theme.fg("muted", `${args.tasks.length} task(s)`)}`, 0, 0);
  if (args.agent) return new Text(`${label} ${theme.fg("muted", args.agent)}`, 0, 0);
  return new Text(label, 0, 0);
}

export function renderSubagentResult(result: SubagentToolResult, { expanded, isPartial }: RenderOptions, theme: Theme) {
  return renderToolDisplayContract(subagentDisplayContract(result, Boolean(expanded), Boolean(isPartial)), theme);
}

export function subagentDisplayContract(result: SubagentToolResult, expanded: boolean, isPartial: boolean): ToolDisplayContract {
  if (result.isError) return { title: textFromResult(result), titleTone: "error" };
  const runs = runsFromResult(result);
  if (!runs) return { title: textFromResult(result) };
  const ok = runs.filter((run) => run.ok).length;
  const display = expanded ? runs : runs.slice(0, 6);
  return {
    title: `${isPartial ? "◌" : "◉"} ${ok}/${runs.length} subagent run(s) ${isPartial ? "running" : "succeeded"}`,
    titleTone: isPartial ? "accent" : ok === runs.length ? "success" : "warning",
    lines: display.flatMap((run) => runDisplayLines(run, expanded, isPartial)),
    footer: !expanded && runs.length > display.length ? `… ${runs.length - display.length} more` : undefined,
  };
}

function runDisplayLines(run: RunRecord, expanded: boolean, isPartial: boolean): ToolDisplayLine[] {
  const output = run.output ? ` → ${run.output}` : "";
  const head = `${run.ok ? "✓" : "✗"} ${run.agent} ${singleLine(run.task, 80)}${output}`;
  const body =
    (expanded || isPartial) && (run.error || run.text) ? `  ${singleLine(run.error || run.text, isPartial ? 240 : 160)}` : undefined;
  const headTone: ToolDisplayTone = run.ok ? "success" : "error";
  const bodyTone: ToolDisplayTone = run.ok ? "dim" : "error";
  return [{ text: head, tone: headTone }, ...(body ? [{ text: body, tone: bodyTone }] : [])];
}
