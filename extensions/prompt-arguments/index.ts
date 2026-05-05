import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PromptTemplate = {
  name: string;
  file: string;
  description: string;
  argumentHint?: string;
  body: string;
};

export default function promptArguments(pi: ExtensionAPI) {
  const templates = discoverPromptTemplates(process.cwd());

  for (const template of templates) {
    pi.registerCommand(template.name, {
      description: template.description,
      handler: async (args, ctx) => {
        const expanded = expandPromptTemplate(template.body, args);
        if (!expanded.trim()) {
          ctx.ui.notify(`Prompt template ${template.name} is empty: ${template.file}`, "warning");
          return;
        }

        pi.sendUserMessage([{ type: "text", text: expanded }], { deliverAs: "followUp" });
      },
    });
  }
}

export function discoverPromptTemplates(cwd: string): PromptTemplate[] {
  const dirs = uniquePaths([
    path.join(cwd, "prompts"),
    path.join(cwd, ".pi", "prompts"),
    path.join(os.homedir(), ".pi", "agent", "prompts"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts"),
  ]);

  const byName = new Map<string, PromptTemplate>();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const name = path.basename(entry.name, ".md");
      if (byName.has(name)) continue;
      const file = path.join(dir, entry.name);
      const parsed = parsePromptTemplate(fs.readFileSync(file, "utf8"));
      const argumentHint = parsed.frontmatter["argument-hint"];
      const description = parsed.frontmatter.description || firstNonEmptyLine(parsed.body) || `Run ${name} prompt template`;
      byName.set(name, {
        name,
        file,
        description: argumentHint ? `${argumentHint} — ${description}` : description,
        argumentHint,
        body: parsed.body,
      });
    }
  }

  return [...byName.values()];
}

export function expandPromptTemplate(template: string, rawArgs: string): string {
  const args = tokenizeArgs(rawArgs);
  const allArgs = args.join(" ");
  const hasPlaceholders = hasArgumentPlaceholders(template);

  const expanded = template
    .replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_match, startValue: string, lengthValue: string | undefined) => {
      const start = Math.max(1, Number.parseInt(startValue, 10)) - 1;
      const length = lengthValue === undefined ? undefined : Math.max(0, Number.parseInt(lengthValue, 10));
      return args.slice(start, length === undefined ? undefined : start + length).join(" ");
    })
    .replace(/\$ARGUMENTS\b/g, allArgs)
    .replace(/\$@/g, allArgs)
    .replace(/\$(\d+)/g, (_match, indexValue: string) => args[Number.parseInt(indexValue, 10) - 1] || "");

  if (!hasPlaceholders && rawArgs.trim()) return `${expanded.trimEnd()}\n\n---\n\nUser arguments:\n${rawArgs.trim()}\n`;
  return expanded;
}

function hasArgumentPlaceholders(template: string) {
  return /\$\{@:\d+(?::\d+)?\}|\$ARGUMENTS\b|\$@|\$\d+/.test(template);
}

export function tokenizeArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += "\\";
  if (current) args.push(current);
  return args;
}

function parsePromptTemplate(content: string) {
  if (!content.startsWith("---\n")) return { frontmatter: {} as Record<string, string>, body: content };
  const end = content.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: {} as Record<string, string>, body: content };

  const frontmatterText = content.slice(4, end);
  const body = content.slice(end + "\n---".length).replace(/^\r?\n/, "");
  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterText.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) frontmatter[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return { frontmatter, body };
}

function firstNonEmptyLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function uniquePaths(values: string[]) {
  return [...new Set(values.map((value) => path.resolve(value)))];
}
