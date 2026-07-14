import path from "node:path";
import { allAgents } from "../subagents/catalog.ts";

export const READ_ONLY_PLANNING_TOOLS = new Set([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  "random_file",
  "package_scout",
  "searxng_status",
  "search",
  "human_in_loop",
  "subagent",
  "todo",
  "graph_memory",
]);

const READ_ONLY_BUILTIN_AGENTS = new Set(["scout", "planner", "reviewer", "researcher"]);
const READ_ONLY_COMMANDS = new Set([
  "cat",
  "command",
  "find",
  "grep",
  "head",
  "ls",
  "pwd",
  "readlink",
  "realpath",
  "rg",
  "sed",
  "sort",
  "stat",
  "tail",
  "wc",
  "which",
]);
const READ_ONLY_GIT_COMMANDS = new Set(["branch", "diff", "log", "ls-files", "rev-parse", "show", "status"]);
const SHELL_WRITE_MARKERS = /[;&|<>\n\r`]|\$\(|\$\{|\\\n/;
const FIND_WRITE_FLAGS = new Set(["-delete", "-exec", "-execdir", "-ok", "-okdir"]);

export type PlanningToolEvent = {
  toolName?: string;
  input?: unknown;
};

export type PlanningContext = {
  cwd?: string;
};

export function isReadOnlyBashCommand(command: string) {
  const value = String(command || "").trim();
  if (!value || SHELL_WRITE_MARKERS.test(value)) return false;

  const tokens = shellWords(value);
  if (!tokens.length || tokens.some((token) => token.startsWith("-") && FIND_WRITE_FLAGS.has(token))) return false;
  if (tokens.some((token) => token.includes("="))) return false;

  const executable = path.basename(tokens[0]);
  if (executable === "git") return isReadOnlyGitCommand(tokens.slice(1));
  if (executable === "sed") return tokens.includes("-n") && !tokens.some((token) => /(?:^|-)i(?:$|=)|--in-place/.test(token));
  if (executable === "command") return tokens[1] === "-v" || tokens[1] === "-V";
  return READ_ONLY_COMMANDS.has(executable);
}

export async function planToolBlockReason(event: PlanningToolEvent, ctx: PlanningContext = {}) {
  const toolName = event.toolName || "unknown";
  if (!READ_ONLY_PLANNING_TOOLS.has(toolName)) return `Blocked tool in /plan before approval: ${toolName}`;

  if (toolName === "bash") {
    const command = inputRecord(event.input).command;
    return isReadOnlyBashCommand(typeof command === "string" ? command : "")
      ? undefined
      : "Blocked non-read-only Bash command in /plan before approval.";
  }

  if (toolName === "subagent") return subagentBlockReason(event.input, ctx.cwd || process.cwd());
  return undefined;
}

async function subagentBlockReason(input: unknown, cwd: string) {
  const value = inputRecord(input);
  const action = typeof value.action === "string" ? value.action : value.tasks ? "parallel" : "run";

  if (action === "list") return undefined;
  if (action === "create" || action === "delete")
    return `Blocked subagent ${action} in /plan before approval because it writes agent files.`;
  if (action !== "run" && action !== "parallel") return `Blocked unsupported subagent action in /plan: ${action}`;
  if (value.output) return "Blocked subagent output path in /plan before approval because it writes a file.";

  const agents = await allAgents(cwd);
  const tasks = action === "parallel" ? (Array.isArray(value.tasks) ? value.tasks : []) : [value];
  if (tasks.length === 0) return "Blocked subagent delegation in /plan: no read-only task was provided.";

  for (const task of tasks) {
    if (task?.output) return "Blocked subagent output path in /plan before approval because it writes a file.";
    const name = task?.agent;
    const agent = agents.find((candidate) => candidate.runtimeName === name || candidate.name === name);
    const readOnly = typeof name === "string" && (READ_ONLY_BUILTIN_AGENTS.has(name) || agent?.readOnly === true);
    if (!readOnly) return `Subagent '${name || "unknown"}' is not declared read-only and is not permitted during /plan.`;
  }

  return undefined;
}

function isReadOnlyGitCommand(args: string[]) {
  const subcommandIndex = args.findIndex((arg) => !arg.startsWith("-"));
  if (subcommandIndex < 0) return false;
  const subcommand = args[subcommandIndex];
  if (!READ_ONLY_GIT_COMMANDS.has(subcommand)) return false;
  return !args.some((arg) => ["--exec", "--upload-pack", "--receive-pack"].includes(arg));
}

function inputRecord(input: unknown): Record<string, any> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, any>) : {};
}

function shellWords(command: string) {
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  for (const character of command) {
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) words.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (quote) return [];
  if (current) words.push(current);
  return words;
}
