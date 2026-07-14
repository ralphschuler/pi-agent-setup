import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { repoRoot } from "../helpers.mjs";

function runGraphMemoryHarness(home, actions, options = {}) {
  const actionList = Array.isArray(actions) ? actions : [actions];
  const promptEvent = options.promptEvent || null;
  const parallel = Boolean(options.parallel);
  const script = `
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import graphMemory from "./extensions/graph-memory/index.ts";

let tool;
const handlers = new Map();
const pi = {
  on: (event, handler) => handlers.set(event, handler),
  registerTool: (definition) => (tool = definition),
};

graphMemory(pi);

const actions = ${JSON.stringify(actionList)};
async function runAction(action, index) {
  const out = await tool.execute("graph-memory-harness-" + index, action);
  return {
    text: out.content?.[0]?.text || "",
    storePath: out.details.storePath,
    nodes: out.details.nodes,
    edges: out.details.edges,
  };
}

const results = [];
if (${JSON.stringify(parallel)}) {
  results.push(...(await Promise.all(actions.map((action, index) => runAction(action, index)))));
} else {
  for (const [index, action] of actions.entries()) results.push(await runAction(action, index));
}

let promptSystemPrompt = "";
const promptEvent = ${JSON.stringify(promptEvent)};
if (promptEvent) {
  const response = await handlers.get("before_agent_start")(promptEvent);
  promptSystemPrompt = response.systemPrompt;
}

const base = join(process.env.HOME, ".pi", "agent");
const sqlitePath = join(base, "graph-memory.sqlite");
const schema = { tables: [], indexes: [], meta: [], foreignKeys: [] };
if (existsSync(sqlitePath)) {
  const db = new DatabaseSync(sqlitePath);
  schema.tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  schema.indexes = db
    .prepare("SELECT name, tbl_name AS tableName FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name")
    .all();
  schema.meta = db.prepare("SELECT key, value FROM meta ORDER BY key").all();
  schema.foreignKeys = db.prepare("PRAGMA foreign_key_list(edges)").all();
  db.close();
}

const last = results[results.length - 1] || { storePath: "", text: "", nodes: [], edges: [] };
console.log(
  JSON.stringify({
    storePath: last.storePath,
    mdExists: existsSync(join(base, "graph-memory.md")),
    sqliteExists: existsSync(sqlitePath),
    nodeCount: last.nodes.length,
    nodes: last.nodes,
    edges: last.edges,
    finalText: last.text,
    results,
    schema,
    promptSystemPrompt,
    agentEntries: existsSync(base) ? readdirSync(base) : [],
    sqliteMode: existsSync(sqlitePath) ? statSync(sqlitePath).mode & 0o777 : undefined,
    backupModes: existsSync(base)
      ? readdirSync(base).filter((entry) => entry.includes(".pre-uuid-")).map((entry) => statSync(join(base, entry)).mode & 0o777)
      : [],
  }),
);
`;

  const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home },
    input: script,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`graph-memory harness failed (${result.status}): ${result.stderr || "no stderr"}`);
  }

  return JSON.parse(result.stdout.trim());
}

function writeLegacyGraphMemory(home) {
  const agentDir = join(home, ".pi", "agent");
  const legacyPath = join(agentDir, "graph-memory.md");
  mkdirSync(agentDir, { recursive: true });

  const sourceNote = Buffer.from("migrated source note", "utf8").toString("base64");
  const targetNote = Buffer.from("migrated target note", "utf8").toString("base64");
  const legacyMarkdown = [
    "# Graph Memory",
    "",
    "<!-- Managed by the pi graph-memory extension. This is a simple markdown knowledge graph. -->",
    "",
    "## Node: Legacy Source",
    "- id: legacy-source",
    "- type: fact",
    "- tags: legacy, source",
    "- updated: 2026-01-01T00:00:00.000Z",
    "",
    "### Notes",
    "```base64",
    sourceNote,
    "```",
    "",
    "## Node: Legacy Target",
    "- id: legacy-target",
    "- type: resource",
    "- tags: legacy, target",
    "- updated: 2026-01-02T00:00:00.000Z",
    "",
    "### Notes",
    "```base64",
    targetNote,
    "```",
    "",
    "## Links",
    "",
    "- `legacy-source` -[`relates-to`]-> `legacy-target`",
    "",
  ].join("\n");
  writeFileSync(legacyPath, legacyMarkdown, "utf8");
}

test("graph memory initializes sqlite schema and indexes by default", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-gm-sqlite-default-"));

  try {
    const out = runGraphMemoryHarness(home, { action: "add_node", title: "SQLite default check" });

    assert.equal(out.storePath.endsWith("graph-memory.sqlite"), true);
    assert.equal(out.mdExists, false);
    assert.equal(out.sqliteExists, true);
    assert.equal(out.nodeCount, 1);
    assert.equal(
      out.nodes.some((node) => node.title === "SQLite default check"),
      true,
      "expected added node to be stored",
    );
    assert.ok(out.schema.tables.includes("nodes"));
    assert.ok(out.schema.tables.includes("edges"));
    assert.ok(out.schema.tables.includes("meta"));
    assert.ok(out.schema.indexes.some((index) => index.name === "nodes_by_title"));
    assert.ok(out.schema.indexes.some((index) => index.name === "nodes_by_type"));
    assert.ok(out.schema.indexes.some((index) => index.name === "edges_by_source"));
    assert.ok(out.schema.indexes.some((index) => index.name === "edges_by_target"));
    assert.equal(out.schema.foreignKeys.length >= 2, true, "expected edge foreign keys to nodes");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("graph memory preserves tool actions across sqlite reloads", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-gm-sqlite-actions-"));

  try {
    const out = runGraphMemoryHarness(home, [
      {
        action: "add_node",
        title: "Alpha Memory",
        type: "decision",
        notes: "A public note that should be searchable",
        tags: ["graph", "sqlite"],
      },
      { action: "link", from: "Alpha Memory", relation: "depends on", to: "Beta Memory" },
      { action: "show", title: "Alpha Memory" },
      { action: "search", query: "public note" },
      { action: "list" },
    ]);

    assert.equal(out.nodeCount, 2);
    const alphaId = out.nodes.find((node) => node.title === "Alpha Memory").id;
    const betaId = out.nodes.find((node) => node.title === "Beta Memory").id;
    assert.match(alphaId, /^[0-9a-f-]{36}$/);
    assert.match(betaId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(out.edges, [{ from: alphaId, relation: "depends-on", to: betaId }]);
    assert.match(out.results[2].text, /# Alpha Memory/);
    assert.match(out.results[3].text, /Alpha Memory/);
    assert.match(out.results[4].text, new RegExp(`${alphaId} -\\[depends-on\\]-> ${betaId}`));

    const reloaded = runGraphMemoryHarness(home, { action: "show", title: "Alpha Memory" });
    assert.match(reloaded.finalText, /A public note that should be searchable/);
    assert.deepEqual(reloaded.edges, [{ from: alphaId, relation: "depends-on", to: betaId }]);

    const forgot = runGraphMemoryHarness(home, { action: "forget", title: "Alpha Memory" });
    assert.equal(
      forgot.nodes.some((node) => node.title === "Alpha Memory"),
      false,
    );
    assert.equal(
      forgot.nodes.some((node) => node.title === "Beta Memory"),
      true,
    );
    assert.deepEqual(forgot.edges, []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("graph memory uses collision-resistant UUID ids for Unicode and long titles", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-gm-sqlite-uuid-"));
  try {
    const longTitle = `${"a".repeat(120)} first`;
    const out = runGraphMemoryHarness(home, [
      { action: "add_node", title: "Café" },
      { action: "add_node", title: "Café" },
      { action: "add_node", title: longTitle },
      { action: "add_node", title: `${"a".repeat(120)} second` },
    ]);
    assert.equal(out.nodeCount, 4);
    assert.equal(new Set(out.nodes.map((node) => node.id)).size, 4);
    assert.ok(out.nodes.every((node) => /^[0-9a-f-]{36}$/.test(node.id)));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("graph memory serializes parallel mutations without dropping nodes", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-gm-sqlite-parallel-"));

  try {
    const out = runGraphMemoryHarness(
      home,
      [
        { action: "add_node", title: "Parallel Alpha" },
        { action: "add_node", title: "Parallel Beta" },
        { action: "add_node", title: "Parallel Gamma" },
      ],
      { parallel: true },
    );

    assert.equal(
      out.nodes.some((node) => node.title === "Parallel Alpha"),
      true,
    );
    assert.equal(
      out.nodes.some((node) => node.title === "Parallel Beta"),
      true,
    );
    assert.equal(
      out.nodes.some((node) => node.title === "Parallel Gamma"),
      true,
    );

    const reloaded = runGraphMemoryHarness(home, { action: "list" });
    assert.equal(reloaded.nodeCount, 3);
    assert.equal(
      reloaded.nodes.some((node) => node.title === "Parallel Alpha"),
      true,
    );
    assert.equal(
      reloaded.nodes.some((node) => node.title === "Parallel Beta"),
      true,
    );
    assert.equal(
      reloaded.nodes.some((node) => node.title === "Parallel Gamma"),
      true,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("graph memory migrates legacy markdown nodes and links into sqlite", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-gm-sqlite-migrate-"));
  writeLegacyGraphMemory(home);

  try {
    const out = runGraphMemoryHarness(home, { action: "list" });

    assert.equal(out.storePath.endsWith("graph-memory.sqlite"), true);
    assert.equal(out.sqliteExists, true);
    assert.equal(out.mdExists, true);
    assert.equal(
      out.nodes.some((node) => node.title === "Legacy Source" && /^[0-9a-f-]{36}$/.test(node.id) && node.notes === "migrated source note"),
      true,
    );
    assert.equal(
      out.nodes.some((node) => node.title === "Legacy Target" && /^[0-9a-f-]{36}$/.test(node.id) && node.type === "resource"),
      true,
    );
    const sourceId = out.nodes.find((node) => node.title === "Legacy Source").id;
    const targetId = out.nodes.find((node) => node.title === "Legacy Target").id;
    assert.deepEqual(out.edges, [{ from: sourceId, relation: "relates-to", to: targetId }]);
    assert.deepEqual(
      out.schema.meta.map((row) => [row.key, row.value]),
      [
        ["legacy_markdown_migrated", "imported"],
        ["node_id_scheme", "uuid-v1"],
      ],
    );
    assert.equal(out.backupModes.length, 1);
    assert.equal(out.backupModes[0], 0o600);
    assert.equal(out.sqliteMode, 0o600);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("graph memory treats legacy markdown as a one-time migration source", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-gm-sqlite-once-"));
  writeLegacyGraphMemory(home);

  try {
    runGraphMemoryHarness(home, { action: "list" });
    runGraphMemoryHarness(home, [
      { action: "forget", title: "Legacy Source" },
      { action: "forget", title: "Legacy Target" },
    ]);

    const out = runGraphMemoryHarness(home, { action: "list" });

    assert.equal(out.mdExists, true);
    assert.equal(out.nodeCount, 0);
    assert.deepEqual(out.edges, []);
    assert.deepEqual(
      out.schema.meta.map((row) => [row.key, row.value]),
      [
        ["legacy_markdown_migrated", "imported"],
        ["node_id_scheme", "uuid-v1"],
      ],
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("graph memory skips legacy markdown import when sqlite already has nodes", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-gm-sqlite-skip-"));

  try {
    runGraphMemoryHarness(home, { action: "add_node", title: "Existing SQLite Memory" });
    writeLegacyGraphMemory(home);

    const out = runGraphMemoryHarness(home, { action: "list" });

    assert.equal(out.nodeCount, 1);
    assert.equal(
      out.nodes.some((node) => node.title === "Existing SQLite Memory"),
      true,
    );
    assert.equal(
      out.nodes.some((node) => node.title === "Legacy Source"),
      false,
    );
    assert.deepEqual(
      out.schema.meta.map((row) => [row.key, row.value]),
      [
        ["legacy_markdown_migrated", "skipped-non-empty"],
        ["node_id_scheme", "uuid-v1"],
      ],
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("graph memory prompt advertises the primary durable knowledge source", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-gm-sqlite-prompt-"));

  try {
    const out = runGraphMemoryHarness(
      home,
      { action: "add_node", title: "Prompt Memory", notes: "prompt-scoped durable context" },
      { promptEvent: { prompt: "Prompt Memory", systemPrompt: "base" } },
    );

    assert.match(out.promptSystemPrompt, /Graph memory is your primary private durable knowledge source across sessions\./);
    assert.match(out.promptSystemPrompt, /Storage: .*graph-memory\.sqlite/);
    assert.match(out.promptSystemPrompt, /Prompt Memory/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
