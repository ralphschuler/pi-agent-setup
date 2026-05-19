import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TOOL_NAME = "mcp";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 32 * 1024;

type TransportKind = "stdio" | "http" | "sse";
type ConfigSource = "project" | "user";

type RawServerConfig = {
  command?: unknown;
  args?: unknown;
  env?: unknown;
  cwd?: unknown;
  url?: unknown;
  transport?: unknown;
  trusted?: unknown;
  headers?: unknown;
};

export type McpServerConfig = {
  name: string;
  source: ConfigSource;
  transport: TransportKind;
  trusted: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
};

export type McpConfigState = {
  paths: { project: string; user: string };
  servers: McpServerConfig[];
  errors: string[];
};

type McpParams = {
  action: "list_servers" | "list_tools" | "call_tool" | "list_resources" | "read_resource";
  server?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  uri?: string;
  timeoutMs?: number;
};

type McpClientLike = {
  listTools(options?: { timeout?: number; signal?: AbortSignal }): Promise<unknown>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    schema?: unknown,
    options?: { timeout?: number; signal?: AbortSignal },
  ): Promise<unknown>;
  listResources(params?: unknown, options?: { timeout?: number; signal?: AbortSignal }): Promise<unknown>;
  readResource(params: { uri: string }, options?: { timeout?: number; signal?: AbortSignal }): Promise<unknown>;
  close(): Promise<void>;
};

type Connector = (server: McpServerConfig, signal?: AbortSignal) => Promise<McpClientLike>;

export default function mcpExtension(pi: ExtensionAPI) {
  const trustedThisSession = new Set<string>();
  const connector: Connector = connectMcpServer;

  pi.registerCommand("mcp", {
    description: "List configured MCP servers and trust status",
    handler: async (args, ctx) => {
      const text = await handleMcpCommand(args || "", ctx.cwd || process.cwd(), trustedThisSession);
      ctx.ui.notify(text, text.startsWith("MCP error") ? "error" : "info");
    },
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: "MCP",
    description: "Call configured MCP servers through a safe gateway.",
    promptSnippet: "List and call configured MCP server tools/resources through one trust-gated gateway.",
    promptGuidelines: [
      "Use mcp only for servers configured in `.mcp.json` or `~/.pi/mcp.json`.",
      "Use mcp list_servers before server-specific actions when server names or trust status are unclear.",
      "MCP project-configured servers may run local commands or access network resources; expect human confirmation before first use.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list_servers"),
        Type.Literal("list_tools"),
        Type.Literal("call_tool"),
        Type.Literal("list_resources"),
        Type.Literal("read_resource"),
      ]),
      server: Type.Optional(Type.String({ description: "Configured MCP server name." })),
      tool: Type.Optional(Type.String({ description: "MCP tool name for call_tool." })),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Arguments for call_tool." })),
      uri: Type.Optional(Type.String({ description: "Resource URI for read_resource." })),
      timeoutMs: Type.Optional(Type.Number({ description: `Request timeout in milliseconds. Default ${DEFAULT_TIMEOUT_MS}.` })),
    }),
    async execute(_toolCallId, params: McpParams, signal, _onUpdate, ctx) {
      const result = await runMcpAction(params, ctx.cwd || process.cwd(), trustedThisSession, ctx, connector, signal);
      return { content: [{ type: "text", text: result.text }], details: result.details };
    },
  });

  pi.on("session_shutdown", async () => trustedThisSession.clear());
}

export async function handleMcpCommand(args: string, cwd: string, trustedThisSession = new Set<string>()) {
  const tokens = shellWords(args);
  const state = loadMcpConfig(cwd);
  if (!tokens.length) return formatServerList(state, trustedThisSession);
  if (tokens[0] === "status" && tokens[1]) {
    const server = findServer(state, tokens[1]);
    if (!server) return `MCP error: unknown server ${tokens[1]}`;
    return formatServerStatus(state, server, trustedThisSession);
  }
  return "MCP error: usage /mcp [status <server>]";
}

export async function runMcpAction(
  params: McpParams,
  cwd: string,
  trustedThisSession: Set<string>,
  ctx: any,
  connector: Connector,
  signal?: AbortSignal,
) {
  const state = loadMcpConfig(cwd);
  if (params.action === "list_servers") return { text: formatServerList(state, trustedThisSession), details: state };

  const server = findServer(state, params.server || "");
  if (!server) throw new Error(params.server ? `Unknown MCP server: ${params.server}` : "MCP server is required.");
  await ensureTrusted(server, trustedThisSession, ctx);

  const timeout = clampTimeout(params.timeoutMs);
  const client = await connector(server, signal);
  try {
    let value: unknown;
    if (params.action === "list_tools") value = await client.listTools({ timeout, signal });
    else if (params.action === "call_tool") {
      if (!params.tool) throw new Error("MCP tool is required for call_tool.");
      value = await client.callTool({ name: params.tool, arguments: params.arguments || {} }, undefined, { timeout, signal });
    } else if (params.action === "list_resources") value = await client.listResources(undefined, { timeout, signal });
    else if (params.action === "read_resource") {
      if (!params.uri) throw new Error("MCP uri is required for read_resource.");
      value = await client.readResource({ uri: params.uri }, { timeout, signal });
    } else throw new Error(`Unsupported MCP action: ${(params as any).action}`);
    return {
      text: formatGatewayResult(params.action, server, value),
      details: { server: publicServer(server), action: params.action, result: value },
    };
  } finally {
    await client.close().catch(() => {});
  }
}

export function loadMcpConfig(cwd: string): McpConfigState {
  const project = path.join(gitRoot(cwd) || cwd, ".mcp.json");
  const user = path.join(os.homedir(), ".pi", "mcp.json");
  const errors: string[] = [];
  const byName = new Map<string, McpServerConfig>();

  for (const [source, file] of [
    ["user", user],
    ["project", project],
  ] as const) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const rawServers = parsed?.mcpServers;
      if (!rawServers || typeof rawServers !== "object" || Array.isArray(rawServers)) throw new Error("missing object mcpServers");
      for (const [name, raw] of Object.entries(rawServers)) byName.set(name, normalizeServer(name, source, raw as RawServerConfig, file));
    } catch (error) {
      errors.push(`${source} ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { paths: { project, user }, servers: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), errors };
}

function normalizeServer(name: string, source: ConfigSource, raw: RawServerConfig, file: string): McpServerConfig {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error(`invalid server name ${name}`);
  const transport = normalizeTransport(raw);
  const trusted = source === "user" && raw.trusted === true;
  const base = { name, source, transport, trusted };
  if (transport === "stdio") {
    if (typeof raw.command !== "string" || !raw.command.trim()) throw new Error(`${name}: stdio server requires command in ${file}`);
    return {
      ...base,
      command: raw.command,
      args: stringArray(raw.args, `${name}.args`),
      env: stringRecord(raw.env, `${name}.env`),
      cwd: typeof raw.cwd === "string" ? raw.cwd : undefined,
    };
  }
  if (typeof raw.url !== "string" || !/^https?:\/\//.test(raw.url))
    throw new Error(`${name}: ${transport} server requires http(s) url in ${file}`);
  return { ...base, url: raw.url, headers: stringRecord(raw.headers, `${name}.headers`) };
}

function normalizeTransport(raw: RawServerConfig): TransportKind {
  if (raw.transport === "http" || raw.transport === "streamable-http") return "http";
  if (raw.transport === "sse") return "sse";
  if (raw.transport === "stdio") return "stdio";
  if (typeof raw.url === "string") return "http";
  return "stdio";
}

async function connectMcpServer(server: McpServerConfig, signal?: AbortSignal): Promise<McpClientLike> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  let transport: any;
  if (server.transport === "stdio") {
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    transport = new StdioClientTransport({
      command: server.command!,
      args: server.args || [],
      env: server.env,
      cwd: server.cwd,
      stderr: "pipe",
    });
  } else if (server.transport === "sse") {
    const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");
    transport = new SSEClientTransport(new URL(server.url!), { requestInit: { headers: server.headers } });
  } else {
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    transport = new StreamableHTTPClientTransport(new URL(server.url!), { requestInit: { headers: server.headers } });
  }
  const client = new Client({ name: "pi-mcp-gateway", version: "0.1.0" }, { capabilities: {} });
  if (signal?.aborted) throw new Error("MCP connection aborted.");
  await client.connect(transport);
  return client as McpClientLike;
}

async function ensureTrusted(server: McpServerConfig, trustedThisSession: Set<string>, ctx: any) {
  if (server.trusted || trustedThisSession.has(server.name)) return;
  if (!ctx?.hasUI || !ctx.ui?.confirm) throw new Error(`MCP server ${server.name} requires interactive trust confirmation.`);
  const ok = await ctx.ui.confirm(
    "Trust MCP server for this session?",
    `${server.name} (${server.source}, ${server.transport}) may run commands, read files, or access network resources. Allow MCP calls this session?`,
  );
  if (!ok) throw new Error(`MCP server ${server.name} was not trusted.`);
  trustedThisSession.add(server.name);
}

function formatServerList(state: McpConfigState, trustedThisSession: Set<string>) {
  const lines = ["MCP servers", `Project config: ${state.paths.project}`, `User config: ${state.paths.user}`];
  if (state.errors.length) lines.push("Errors:", ...state.errors.map((e) => `- ${redact(e)}`));
  if (!state.servers.length) lines.push("No MCP servers configured.");
  for (const server of state.servers)
    lines.push(`- ${server.name}: ${server.transport}, ${server.source}, trust=${trustLabel(server, trustedThisSession)}`);
  return lines.join("\n");
}

function formatServerStatus(state: McpConfigState, server: McpServerConfig, trustedThisSession: Set<string>) {
  const lines = [
    `MCP server ${server.name}`,
    `Source: ${server.source}`,
    `Transport: ${server.transport}`,
    `Trust: ${trustLabel(server, trustedThisSession)}`,
  ];
  if (server.transport === "stdio") lines.push(`Command: ${server.command} ${(server.args || []).join(" ")}`.trim());
  else lines.push(`URL: ${server.url}`);
  if (state.errors.length) lines.push("Config errors:", ...state.errors.map((e) => `- ${redact(e)}`));
  return lines.join("\n");
}

function formatGatewayResult(action: string, server: McpServerConfig, value: unknown) {
  return truncateText([`MCP ${action} result from ${server.name}`, "", JSON.stringify(redactValue(value), null, 2)].join("\n"));
}

function trustLabel(server: McpServerConfig, trustedThisSession: Set<string>) {
  if (server.trusted) return "trusted-config";
  if (trustedThisSession.has(server.name)) return "trusted-session";
  return "confirmation-required";
}

function findServer(state: McpConfigState, name: string) {
  return state.servers.find((server) => server.name === name);
}

function publicServer(server: McpServerConfig) {
  const { env: _env, headers: _headers, ...rest } = server;
  return rest;
}

function stringArray(value: unknown, label: string) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label} must be an array of strings`);
  return value;
}

function stringRecord(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") throw new Error(`${label}.${key} must be a string`);
    out[key] = item;
  }
  return out;
}

function clampTimeout(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.min(120_000, Math.floor(Number(value))));
}

function truncateText(text: string) {
  if (Buffer.byteLength(text) <= MAX_OUTPUT_BYTES) return text;
  return `${Buffer.from(text).subarray(0, MAX_OUTPUT_BYTES).toString("utf8")}\n[truncated]`;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value))
      out[key] = /token|secret|password|authorization|api[_-]?key/i.test(key) ? "[redacted]" : redactValue(item);
    return out;
  }
  return value;
}

function redact(text: string) {
  return text.replace(/(token|secret|password|authorization|api[_-]?key)([\w -]*[:=])([^\s]+)/gi, "$1$2[redacted]");
}

function gitRoot(cwd: string) {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500,
    }).trim();
  } catch {}
  return cwd;
}

function shellWords(input: string) {
  const words: string[] = [];
  let current = "";
  let quote = "";
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = "";
      else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (/\s/.test(ch)) {
      if (current) words.push(current);
      current = "";
    } else current += ch;
  }
  if (quote) throw new Error("Unclosed quote in /mcp arguments");
  if (current) words.push(current);
  return words;
}

export const __mcpTest = { formatServerList, trustLabel, truncateText, redactValue };
