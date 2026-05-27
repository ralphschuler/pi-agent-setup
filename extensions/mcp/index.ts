import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const TOOL_NAME = "mcp";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 32 * 1024;
const OAUTH_CALLBACK_TIMEOUT_MS = 120_000;
const OAUTH_CLIENT_NAME = "Pi MCP Gateway";

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
  auth?: unknown;
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
  auth?: "oauth";
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

type Connector = (server: McpServerConfig, signal?: AbortSignal, ctx?: any) => Promise<McpClientLike>;

type OAuthTokens = Record<string, unknown>;
type OAuthClientInformation = Record<string, unknown>;
type OAuthDiscoveryState = Record<string, unknown>;
type OAuthServerState = {
  tokens?: OAuthTokens;
  clientInformation?: OAuthClientInformation;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
};
type OAuthStateFile = { servers: Record<string, OAuthServerState> };

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
  if (tokens[0] === "auth-clear" && tokens[1]) {
    const server = findServer(state, tokens[1]);
    if (!server) return `MCP error: unknown server ${tokens[1]}`;
    clearMcpOAuthState(server);
    return `Cleared MCP OAuth state for ${server.name}.`;
  }
  if (tokens[0] === "status" && tokens[1]) {
    const server = findServer(state, tokens[1]);
    if (!server) return `MCP error: unknown server ${tokens[1]}`;
    return formatServerStatus(state, server, trustedThisSession);
  }
  return "MCP error: usage /mcp [status <server>|auth-clear <server>]";
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
  const client = await connector(server, signal, ctx);
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
  return { ...base, url: raw.url, headers: stringRecord(raw.headers, `${name}.headers`), auth: normalizeAuth(raw.auth, name) };
}

function normalizeTransport(raw: RawServerConfig): TransportKind {
  if (raw.transport === "http" || raw.transport === "streamable-http") return "http";
  if (raw.transport === "sse") return "sse";
  if (raw.transport === "stdio") return "stdio";
  if (typeof raw.url === "string") return "http";
  return "stdio";
}

function normalizeAuth(value: unknown, name: string) {
  if (value === undefined || value === false || value === null) return undefined;
  if (value === "oauth") return "oauth" as const;
  throw new Error(`${name}.auth must be "oauth" when provided`);
}

async function connectMcpServer(server: McpServerConfig, signal?: AbortSignal, ctx?: any): Promise<McpClientLike> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const makeClient = () => new Client({ name: "pi-mcp-gateway", version: "0.1.0" }, { capabilities: {} });
  let oauthSession: OAuthCallbackSession | undefined;
  let transport: any = await createTransport(server, ctx, (session) => {
    oauthSession = session;
  });
  let client = makeClient();
  if (signal?.aborted) throw new Error("MCP connection aborted.");
  try {
    await client.connect(transport);
    return client as McpClientLike;
  } catch (error) {
    if (!server.auth || !isUnauthorizedOAuthError(error) || !oauthSession) throw error;
    const code = await oauthSession.waitForCode(signal);
    await transport.finishAuth(code);
    await client.close().catch(() => {});
    transport = await createTransport(server, ctx, () => {});
    client = makeClient();
    await client.connect(transport);
    return client as McpClientLike;
  } finally {
    oauthSession?.close();
  }
}

async function createTransport(server: McpServerConfig, ctx: any, onOAuthSession: (session: OAuthCallbackSession) => void) {
  if (server.transport === "stdio") {
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    return new StdioClientTransport({
      command: server.command!,
      args: server.args || [],
      env: server.env,
      cwd: server.cwd,
      stderr: "pipe",
    });
  }

  const authProvider: any = server.auth === "oauth" ? await createInteractiveOAuthProvider(server, ctx, onOAuthSession) : undefined;
  if (server.transport === "sse") {
    const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");
    return new SSEClientTransport(new URL(server.url!), { authProvider, requestInit: { headers: server.headers } });
  }
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  return new StreamableHTTPClientTransport(new URL(server.url!), { authProvider, requestInit: { headers: server.headers } });
}

function isUnauthorizedOAuthError(error: unknown) {
  return error instanceof Error && /unauthorized|authorization|auth/i.test(error.message);
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
  for (const server of state.servers) {
    const auth = server.auth ? `, auth=${oauthStatus(server)}` : "";
    lines.push(`- ${server.name}: ${server.transport}, ${server.source}, trust=${trustLabel(server, trustedThisSession)}${auth}`);
  }
  return lines.join("\n");
}

function formatServerStatus(state: McpConfigState, server: McpServerConfig, trustedThisSession: Set<string>) {
  const lines = [
    `MCP server ${server.name}`,
    `Source: ${server.source}`,
    `Transport: ${server.transport}`,
    `Trust: ${trustLabel(server, trustedThisSession)}`,
    `Auth: ${server.auth ? oauthStatus(server) : "none"}`,
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

export function oauthStatePath() {
  return path.join(os.homedir(), ".pi", "mcp-oauth.json");
}

export function readMcpOAuthState(): OAuthStateFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(oauthStatePath(), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.servers || typeof parsed.servers !== "object")
      return { servers: {} };
    return { servers: parsed.servers as Record<string, OAuthServerState> };
  } catch {
    return { servers: {} };
  }
}

function writeMcpOAuthState(state: OAuthStateFile) {
  const file = oauthStatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

export function mcpOAuthStateKey(server: Pick<McpServerConfig, "name" | "source" | "url">) {
  return [server.source, server.name, server.url || ""].join(":");
}

export function clearMcpOAuthState(server: Pick<McpServerConfig, "name" | "source" | "url">) {
  const state = readMcpOAuthState();
  delete state.servers[mcpOAuthStateKey(server)];
  writeMcpOAuthState(state);
}

function getOAuthServerState(server: Pick<McpServerConfig, "name" | "source" | "url">) {
  const state = readMcpOAuthState();
  return state.servers[mcpOAuthStateKey(server)] || {};
}

function setOAuthServerState(server: Pick<McpServerConfig, "name" | "source" | "url">, patch: OAuthServerState) {
  const state = readMcpOAuthState();
  const key = mcpOAuthStateKey(server);
  state.servers[key] = { ...(state.servers[key] || {}), ...patch };
  writeMcpOAuthState(state);
}

function oauthStatus(server: Pick<McpServerConfig, "name" | "source" | "url">) {
  return `oauth:${getOAuthServerState(server).tokens ? "authorized" : "missing"}`;
}

type OAuthCallbackSession = {
  redirectUrl: string;
  waitForCode(signal?: AbortSignal): Promise<string>;
  close(): void;
};

async function createInteractiveOAuthProvider(server: McpServerConfig, ctx: any, onOAuthSession: (session: OAuthCallbackSession) => void) {
  if (!ctx?.hasUI) throw new Error(`MCP OAuth server ${server.name} requires interactive UI authorization.`);
  const session = await startOAuthCallbackSession(server.name);
  onOAuthSession(session);
  return createMcpOAuthProvider(server, ctx, session.redirectUrl);
}

export function createMcpOAuthProvider(server: McpServerConfig, ctx: any, redirectUrl: string) {
  const metadata = {
    client_name: OAUTH_CLIENT_NAME,
    redirect_uris: [redirectUrl],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
  return {
    get redirectUrl() {
      return redirectUrl;
    },
    get clientMetadata() {
      return metadata;
    },
    clientInformation() {
      return getOAuthServerState(server).clientInformation;
    },
    saveClientInformation(clientInformation: OAuthClientInformation) {
      setOAuthServerState(server, { clientInformation });
    },
    tokens() {
      return getOAuthServerState(server).tokens;
    },
    saveTokens(tokens: OAuthTokens) {
      setOAuthServerState(server, { tokens });
    },
    redirectToAuthorization(authorizationUrl: URL) {
      const text = `Open MCP OAuth authorization URL for ${server.name}:\n${authorizationUrl.toString()}\nAfter authorization, return to Pi; the localhost callback will finish automatically.`;
      ctx?.ui?.notify?.(text, "info");
    },
    saveCodeVerifier(codeVerifier: string) {
      setOAuthServerState(server, { codeVerifier });
    },
    codeVerifier() {
      const verifier = getOAuthServerState(server).codeVerifier;
      if (!verifier) throw new Error(`No MCP OAuth verifier saved for ${server.name}.`);
      return verifier;
    },
    saveDiscoveryState(discoveryState: OAuthDiscoveryState) {
      setOAuthServerState(server, { discoveryState });
    },
    discoveryState() {
      return getOAuthServerState(server).discoveryState;
    },
    invalidateCredentials(scope: string) {
      if (scope === "tokens") setOAuthServerState(server, { tokens: undefined });
      else if (scope === "client") setOAuthServerState(server, { clientInformation: undefined });
      else if (scope === "verifier") setOAuthServerState(server, { codeVerifier: undefined });
      else if (scope === "discovery") setOAuthServerState(server, { discoveryState: undefined });
      else clearMcpOAuthState(server);
    },
  };
}

function startOAuthCallbackSession(serverName: string): Promise<OAuthCallbackSession> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let codeResolver: ((code: string) => void) | undefined;
    let codeRejecter: ((error: Error) => void) | undefined;
    const codePromise = new Promise<string>((codeResolve, codeReject) => {
      codeResolver = codeResolve;
      codeRejecter = codeReject;
    });
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Missing OAuth code. Return to Pi and retry authorization.");
        codeRejecter?.(new Error(`MCP OAuth callback for ${serverName} did not include a code.`));
        return;
      }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("MCP OAuth authorization complete. You can return to Pi.");
      codeResolver?.(code);
    });
    server.on("error", (error) => {
      if (!settled) reject(error);
      else codeRejecter?.(error instanceof Error ? error : new Error(String(error)));
    });
    server.listen(0, "127.0.0.1", () => {
      settled = true;
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not start MCP OAuth callback server."));
        return;
      }
      const redirectUrl = `http://127.0.0.1:${address.port}/callback`;
      resolve({
        redirectUrl,
        waitForCode(signal?: AbortSignal) {
          if (signal?.aborted) return Promise.reject(new Error(`MCP OAuth authorization for ${serverName} was aborted.`));
          let timeout: NodeJS.Timeout;
          return new Promise<string>((codeResolve, codeReject) => {
            const abort = () => codeReject(new Error(`MCP OAuth authorization for ${serverName} was aborted.`));
            signal?.addEventListener("abort", abort, { once: true });
            timeout = setTimeout(
              () => codeReject(new Error(`Timed out waiting for MCP OAuth authorization for ${serverName}.`)),
              OAUTH_CALLBACK_TIMEOUT_MS,
            );
            codePromise.then(codeResolve, codeReject).finally(() => {
              clearTimeout(timeout);
              signal?.removeEventListener("abort", abort);
            });
          });
        },
        close() {
          server.close();
        },
      });
    });
  });
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
