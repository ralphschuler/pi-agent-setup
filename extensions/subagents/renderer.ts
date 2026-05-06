// @ts-nocheck
import { Text } from "@mariozechner/pi-tui";
import { renderToolDisplayContract, singleLine } from "../shared/pretty-render.ts";
import { textFromResult } from "./result.ts";
import type { RunRecord } from "./types.ts";

export function renderSubagentCall(args: any, theme: any) {
  const action = args.action || (args.tasks ? "parallel" : "run");
  const label = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", action);
  if (args.tasks) return new Text(`${label} ${theme.fg("muted", `${args.tasks.length} task(s)`)}`, 0, 0);
  if (args.agent) return new Text(`${label} ${theme.fg("muted", args.agent)}`, 0, 0);
  return new Text(label, 0, 0);
}

export function renderSubagentResult(result: any, { expanded, isPartial }: { expanded?: boolean; isPartial?: boolean }, theme: any) {
  return renderToolDisplayContract(subagentDisplayContract(result, Boolean(expanded), Boolean(isPartial)), theme);
}

export function subagentDisplayContract(result: any, expanded: boolean, isPartial: boolean) {
  const details = result.details as any;
  if (result.isError) return { title: textFromResult(result), titleTone: "error" as const };
  if (!details?.runs) return { title: textFromResult(result) };
  const runs = details.runs as RunRecord[];
  const ok = runs.filter((run) => run.ok).length;
  const display = expanded ? runs : runs.slice(0, 6);
  return {
    title: `${isPartial ? "◌" : "◉"} ${ok}/${runs.length} subagent run(s) ${isPartial ? "running" : "succeeded"}`,
    titleTone: (isPartial ? "accent" : ok === runs.length ? "success" : "warning") as const,
    lines: display.flatMap((run) => {
      const output = run.output ? ` → ${run.output}` : "";
      const head = `${run.ok ? "✓" : "✗"} ${run.agent} ${singleLine(run.task, 80)}${output}`;
      const body =
        (expanded || isPartial) && (run.error || run.text) ? `  ${singleLine(run.error || run.text, isPartial ? 240 : 160)}` : undefined;
      return [
        { text: head, tone: run.ok ? ("success" as const) : ("error" as const) },
        body ? { text: body, tone: run.ok ? ("dim" as const) : ("error" as const) } : undefined,
      ].filter(Boolean);
    }),
    footer: !expanded && runs.length > display.length ? `… ${runs.length - display.length} more` : undefined,
  };
}
