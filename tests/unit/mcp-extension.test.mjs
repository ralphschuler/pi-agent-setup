import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import mcpExtension, { handleMcpCommand, loadMcpConfig, runMcpAction } from "../../extensions/mcp/index.ts";

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mcp-test-"));
  fs.mkdirSync(path.join(root, ".git"));
  return root;
}

function withHome(t) {
  const oldHome = process.env.HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mcp-home-"));
  process.env.HOME = home;
  fs.mkdirSync(path.join(home, ".pi"), { recursive: true });
  t.after(() => {
    process.env.HOME = oldHome;
  });
  return home;
}

function registeredMcp() {
  let tool;
  const commands = new Map();
  mcpExtension({
    registerTool(candidate) {
      tool = candidate;
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });
  assert.ok(tool, "mcp tool registered");
  assert.ok(commands.get("mcp"), "mcp command registered");
  return { tool, commands };
}

test("mcp extension registers command and gateway tool", () => {
  const { tool, commands } = registeredMcp();
  assert.equal(tool.name, "mcp");
  assert.equal(commands.get("mcp").description, "List configured MCP servers and trust status");
});

test("loadMcpConfig merges user and project servers with project overriding by name", (t) => {
  const repo = tempRepo();
  const home = withHome(t);
  fs.writeFileSync(
    path.join(home, ".pi", "mcp.json"),
    JSON.stringify({ mcpServers: { shared: { command: "user-cmd", trusted: true }, userOnly: { url: "https://example.com/mcp" } } }),
  );
  fs.writeFileSync(
    path.join(repo, ".mcp.json"),
    JSON.stringify({
      mcpServers: { shared: { command: "project-cmd", args: ["a"] }, projectOnly: { transport: "sse", url: "http://localhost:3000/sse" } },
    }),
  );

  const state = loadMcpConfig(repo);
  assert.deepEqual(
    state.servers.map((server) => [server.name, server.source, server.transport, server.trusted, server.command || server.url]),
    [
      ["projectOnly", "project", "sse", false, "http://localhost:3000/sse"],
      ["shared", "project", "stdio", false, "project-cmd"],
      ["userOnly", "user", "http", false, "https://example.com/mcp"],
    ],
  );
});

test("loadMcpConfig reports malformed config and rejects invalid server fields", (t) => {
  const repo = tempRepo();
  withHome(t);
  fs.writeFileSync(path.join(repo, ".mcp.json"), JSON.stringify({ mcpServers: { bad: { command: "x", args: ["ok", 1] } } }));
  const state = loadMcpConfig(repo);
  assert.equal(state.servers.length, 0);
  assert.match(state.errors.join("\n"), /bad\.args must be an array of strings/);
});

test("/mcp command lists servers and status without connecting", async (t) => {
  const repo = tempRepo();
  withHome(t);
  fs.writeFileSync(path.join(repo, ".mcp.json"), JSON.stringify({ mcpServers: { local: { command: "node", args: ["server.js"] } } }));
  const list = await handleMcpCommand("", repo, new Set());
  assert.match(list, /MCP servers/);
  assert.match(list, /local: stdio, project, trust=confirmation-required/);
  const status = await handleMcpCommand("status local", repo, new Set(["local"]));
  assert.match(status, /MCP server local/);
  assert.match(status, /Trust: trusted-session/);
  assert.match(status, /Command: node server\.js/);
});

test("mcp list_servers action returns config details without trust prompt", async (t) => {
  const repo = tempRepo();
  withHome(t);
  fs.writeFileSync(path.join(repo, ".mcp.json"), JSON.stringify({ mcpServers: { local: { command: "node" } } }));
  const result = await runMcpAction({ action: "list_servers" }, repo, new Set(), {}, async () => assert.fail("must not connect"));
  assert.match(result.text, /local: stdio/);
  assert.equal(result.details.servers.length, 1);
});

test("mcp gateway confirms first untrusted server use and then calls fake client", async (t) => {
  const repo = tempRepo();
  withHome(t);
  fs.writeFileSync(path.join(repo, ".mcp.json"), JSON.stringify({ mcpServers: { local: { command: "node" } } }));
  const trusted = new Set();
  let confirmed = 0;
  let closed = 0;
  const ctx = { hasUI: true, ui: { confirm: async () => (confirmed += 1) && true } };
  const connector = async (server) => ({
    async listTools() {
      assert.equal(server.name, "local");
      return { tools: [{ name: "hello", inputSchema: { type: "object" } }] };
    },
    async callTool() {
      throw new Error("unused");
    },
    async listResources() {
      return { resources: [] };
    },
    async readResource() {
      return { contents: [] };
    },
    async close() {
      closed += 1;
    },
  });

  const first = await runMcpAction({ action: "list_tools", server: "local" }, repo, trusted, ctx, connector);
  assert.match(first.text, /hello/);
  assert.equal(confirmed, 1);
  assert.equal(closed, 1);
  assert.ok(trusted.has("local"));

  await runMcpAction({ action: "list_resources", server: "local" }, repo, trusted, ctx, connector);
  assert.equal(confirmed, 1, "second call uses session trust");
});

test("mcp gateway fails closed when untrusted server has no interactive UI", async (t) => {
  const repo = tempRepo();
  withHome(t);
  fs.writeFileSync(path.join(repo, ".mcp.json"), JSON.stringify({ mcpServers: { local: { command: "node" } } }));
  await assert.rejects(
    runMcpAction({ action: "list_tools", server: "local" }, repo, new Set(), { hasUI: false }, async () => assert.fail("must not connect")),
    /requires interactive trust confirmation/,
  );
});

test("trusted user server can call tool without prompt and redacts secret output", async (t) => {
  const repo = tempRepo();
  const home = withHome(t);
  fs.writeFileSync(
    path.join(home, ".pi", "mcp.json"),
    JSON.stringify({ mcpServers: { remote: { url: "https://example.com/mcp", trusted: true } } }),
  );
  const result = await runMcpAction(
    { action: "call_tool", server: "remote", tool: "x", arguments: { value: 1 } },
    repo,
    new Set(),
    { hasUI: false },
    async () => ({
      async listTools() {
        return {};
      },
      async callTool(params) {
        assert.deepEqual(params, { name: "x", arguments: { value: 1 } });
        return { apiKey: "secret", ok: true };
      },
      async listResources() {
        return {};
      },
      async readResource() {
        return {};
      },
      async close() {},
    }),
  );
  assert.match(result.text, /\[redacted\]/);
  assert.doesNotMatch(result.text, /secret/);
});
