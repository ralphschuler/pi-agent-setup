// @ts-nocheck
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Markdown, Text } from "@mariozechner/pi-tui";

export function createPrettyMarkdown(markdown: string) {
  return new Markdown(markdown, 0, 0, getMarkdownTheme());
}

export type ToolDisplayTone = "accent" | "success" | "warning" | "error" | "muted" | "dim" | "toolTitle";
export type ToolDisplayLine = string | { text: string; tone?: ToolDisplayTone; prefix?: string };
export type ToolDisplaySection = {
  title?: string;
  titleTone?: ToolDisplayTone;
  lines?: string[];
  text?: string;
  tone?: ToolDisplayTone;
  maxLines?: number;
};
export type ToolDisplayContract = {
  title?: string;
  titleTone?: ToolDisplayTone;
  summary?: string;
  summaryTone?: ToolDisplayTone;
  lines?: ToolDisplayLine[];
  sections?: ToolDisplaySection[];
  footer?: string;
  footerTone?: ToolDisplayTone;
};

export function renderPrettyToolResult(toolName: string) {
  return (
    result: unknown,
    options: { expanded?: boolean; isPartial?: boolean } = {},
    _theme?: unknown,
    context: { args?: unknown } = {},
  ) => {
    return createPrettyMarkdown(formatPrettyToolMarkdown(toolName, result, options, context.args));
  };
}

export function renderToolDisplayContract(display: ToolDisplayContract, theme: any) {
  return new Text(formatToolDisplayContract(display, theme), 0, 0);
}

export function formatToolDisplayContract(display: ToolDisplayContract, theme: any) {
  const lines: string[] = [];
  if (display.title) lines.push(color(theme, display.titleTone || "accent", display.title));
  if (display.summary) lines.push(color(theme, display.summaryTone || "dim", display.summary));
  for (const line of display.lines || []) lines.push(formatDisplayLine(line, theme));
  for (const section of display.sections || []) {
    const body = section.lines ? section.lines.join("\n") : section.text || "";
    const text = section.maxLines ? tailLines(body, section.maxLines, 4000) : body;
    if (section.title) lines.push(color(theme, section.titleTone || "muted", section.title));
    if (text) lines.push(color(theme, section.tone || "", text));
  }
  if (display.footer) lines.push(color(theme, display.footerTone || "dim", display.footer));
  return lines.join("\n");
}

function formatDisplayLine(line: ToolDisplayLine, theme: any) {
  if (typeof line === "string") return line;
  return `${line.prefix || ""}${color(theme, line.tone || "", line.text)}`;
}

function color(theme: any, tone: string, text: string) {
  return tone && theme?.fg ? theme.fg(tone, text) : text;
}

export function formatPrettyToolMarkdown(
  toolName: string,
  result: unknown,
  options: { expanded?: boolean; isPartial?: boolean } = {},
  args?: unknown,
) {
  if (options.isPartial) return partialToolMarkdown(toolName, result, args);

  const text = textFromResult(result).trimEnd();
  const isError = Boolean((result as { isError?: boolean } | undefined)?.isError);
  const title = `${isError ? "❌" : "✅"} ${toolName}`;
  const hint = options.expanded ? "" : "\n\n_Expand for full context when available._";
  const language = languageForTool(toolName, args);

  return `${titleLine(title, args)}\n\n${fenced(text || emptyTextForTool(toolName), language)}${hint}`;
}

export function textFromResult(result: unknown) {
  const content = (result as { content?: Array<{ type?: string; text?: string }> } | undefined)?.content;
  return content?.find((block) => block.type === "text")?.text || "";
}

function titleLine(title: string, args: unknown) {
  const summary = summarizeArgs(args);
  return summary ? `**${title}**\n\n\`${summary}\`` : `**${title}**`;
}

function summarizeArgs(args: unknown) {
  if (!args || typeof args !== "object") return "";
  const value = args as Record<string, unknown>;
  const primary = value.command || value.path || value.pattern || value.name || value.action || value.query || value.mode;
  return typeof primary === "string" ? singleLine(primary, 120) : "";
}

function languageForTool(toolName: string, args: unknown) {
  if (toolName === "read" || toolName === "write") return languageFromArgs(args);
  if (toolName === "edit") return "diff";
  if (toolName === "bash") return "text";
  return "text";
}

function languageFromArgs(args: unknown) {
  if (!args || typeof args !== "object") return "text";
  const path = (args as { path?: unknown }).path;
  if (typeof path !== "string") return "text";
  const ext = path.split(".").pop()?.toLowerCase();
  return (
    (
      {
        ts: "ts",
        js: "js",
        mjs: "js",
        json: "json",
        md: "md",
        css: "css",
        html: "html",
        sh: "bash",
        py: "py",
        rs: "rust",
        go: "go",
        yml: "yaml",
        yaml: "yaml",
      } as Record<string, string>
    )[ext || ""] || "text"
  );
}

function partialToolMarkdown(toolName: string, result: unknown, args: unknown) {
  const text = textFromResult(result).trimEnd();
  const title = `⏳ ${toolName}`;
  if (!text) return `${titleLine(title, args)}\n\n_Working…_`;
  const tail = tailLines(text, 8, 4000);
  return `${titleLine(title, args)}\n\n${fenced(tail, languageForTool(toolName, args))}`;
}

export function tailLines(text: string, maxLines: number, maxChars: number) {
  const lines = text.split(/\r?\n/).slice(-maxLines).join("\n");
  return lines.length <= maxChars ? lines : `…${lines.slice(lines.length - maxChars)}`;
}

function emptyTextForTool(toolName: string) {
  if (toolName === "read") return "<empty file>";
  return "<no output>";
}

function fenced(text: string, language: string) {
  const safe = text.replace(/```/g, "`\u200b``");
  return `\`\`\`${language}\n${safe}\n\`\`\``;
}

export function singleLine(text: string, max: number) {
  const cleaned = String(text || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, Math.max(0, max - 1))}…`;
}
