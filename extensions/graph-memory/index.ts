import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { decodeStoredBlock, encodeStoredBlock, normalizeSingleLine } from "../shared/markdown-store-codec.ts";
import { renderPrettyToolResult } from "../shared/pretty-render.ts";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";

const STORE_DIR = join(homedir(), ".pi", "agent");
const STORE_PATH = join(STORE_DIR, "graph-memory.sqlite");
const LEGACY_STORE_PATH = join(STORE_DIR, "graph-memory.md");

type NodeType = "concept" | "person" | "project" | "decision" | "fact" | "task" | "resource";

type MemoryNode = {
  id: string;
  title: string;
  type: NodeType;
  notes: string;
  tags: string[];
  updatedAt: string;
};

type MemoryEdge = {
  from: string;
  relation: string;
  to: string;
};

type GraphStore = {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
};

const nodeTypes = ["concept", "person", "project", "decision", "fact", "task", "resource"] as const;

const NODE_COLUMNS = "id, title, type, notes, tags, updated_at as updatedAt";
const LEGACY_MIGRATION_KEY = "legacy_markdown_migrated";
const NODE_ID_SCHEME_KEY = "node_id_scheme";
const NODE_ID_SCHEME = "uuid-v1";

export default function graphMemory(pi: ExtensionAPI) {
  let store: GraphStore = { nodes: [], edges: [] };
  let database: DatabaseSync | undefined;
  let didMigrateLegacy = false;

  function openDb() {
    if (database) return database;

    mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
    chmodSync(STORE_DIR, 0o700);
    database = new DatabaseSync(STORE_PATH);
    chmodSync(STORE_PATH, 0o600);
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec("PRAGMA busy_timeout = 5000;");
    database.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        notes TEXT NOT NULL,
        tags TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        to_id TEXT NOT NULL,
        UNIQUE(from_id, relation, to_id),
        FOREIGN KEY(from_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY(to_id) REFERENCES nodes(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS nodes_by_title ON nodes(title COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS nodes_by_type ON nodes(type);
      CREATE INDEX IF NOT EXISTS nodes_by_updated_at ON nodes(updated_at);
      CREATE INDEX IF NOT EXISTS edges_by_source ON edges(from_id);
      CREATE INDEX IF NOT EXISTS edges_by_target ON edges(to_id);
    `);

    migrateLegacyStore();
    migrateNodeIds(database);
    chmodSync(STORE_PATH, 0o600);
    return database;
  }

  function runInTransaction<T>(callback: (db: DatabaseSync) => T): T {
    const db = openDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback(db);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Best-effort rollback.
      }
      throw error;
    }
  }

  async function loadStore() {
    try {
      store = readStoreFromDb(openDb());
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "ENOENT") console.warn(`[graph-memory] Failed to load ${STORE_PATH}:`, error);
      store = { nodes: [], edges: [] };
    }
  }

  function readStoreFromDb(db: DatabaseSync): GraphStore {
    const rows = db.prepare(`SELECT ${NODE_COLUMNS} FROM nodes ORDER BY id`).all() as Array<{
      id: string;
      title: string;
      type: string;
      notes: string;
      tags: string;
      updatedAt: string;
    }>;

    const edges = db
      .prepare("SELECT from_id AS source, relation, to_id AS target FROM edges ORDER BY from_id, relation, to_id")
      .all() as Array<{
      source: string;
      relation: string;
      target: string;
    }>;

    return {
      nodes: rows.map((node) => ({
        id: node.id,
        title: node.title,
        type: isNodeType(node.type) ? node.type : "fact",
        notes: node.notes || "",
        tags: parseTags(node.tags),
        updatedAt: node.updatedAt || new Date(0).toISOString(),
      })),
      edges: edges.map((edge) => ({
        from: edge.source,
        relation: edge.relation,
        to: edge.target,
      })),
    };
  }

  function saveStore(db: DatabaseSync) {
    db.exec("DELETE FROM edges;");
    db.exec("DELETE FROM nodes;");

    const insertNode = db.prepare("INSERT INTO nodes (id, title, type, notes, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
    for (const node of store.nodes) {
      insertNode.run(node.id, node.title, node.type, node.notes, JSON.stringify(node.tags), node.updatedAt);
    }

    const insertEdge = db.prepare("INSERT OR IGNORE INTO edges (from_id, relation, to_id) VALUES (?, ?, ?)");
    for (const edge of store.edges) {
      insertEdge.run(edge.from, edge.relation, edge.to);
    }
  }

  function migrateNodeIds(db: DatabaseSync) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    try {
      if (getMeta(db, NODE_ID_SCHEME_KEY) === NODE_ID_SCHEME) {
        db.exec("COMMIT");
        return;
      }

      const nodes = db.prepare("SELECT id, title, type, notes, tags, updated_at AS updatedAt FROM nodes ORDER BY id").all() as Array<{
        id: string;
        title: string;
        type: string;
        notes: string;
        tags: string;
        updatedAt: string;
      }>;
      if (nodes.length === 0) {
        markNodeIdScheme(db);
        db.exec("COMMIT");
        return;
      }

      const backupPath = `${STORE_PATH}.pre-uuid-${Date.now()}.bak`;
      copyFileSync(STORE_PATH, backupPath);
      chmodSync(backupPath, 0o600);

      const idMap = new Map(nodes.map((node) => [node.id, randomUUID()]));
      const edges = db.prepare("SELECT from_id AS fromId, relation, to_id AS toId FROM edges").all() as Array<{
        fromId: string;
        relation: string;
        toId: string;
      }>;

      db.exec(`
        CREATE TABLE nodes_uuid (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          notes TEXT NOT NULL,
          tags TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE edges_uuid (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_id TEXT NOT NULL,
          relation TEXT NOT NULL,
          to_id TEXT NOT NULL,
          UNIQUE(from_id, relation, to_id),
          FOREIGN KEY(from_id) REFERENCES nodes_uuid(id) ON DELETE CASCADE,
          FOREIGN KEY(to_id) REFERENCES nodes_uuid(id) ON DELETE CASCADE
        );
      `);
      const insertNode = db.prepare("INSERT INTO nodes_uuid (id, title, type, notes, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
      for (const node of nodes) insertNode.run(idMap.get(node.id), node.title, node.type, node.notes, node.tags, node.updatedAt);
      const insertEdge = db.prepare("INSERT OR IGNORE INTO edges_uuid (from_id, relation, to_id) VALUES (?, ?, ?)");
      for (const edge of edges) {
        const from = idMap.get(edge.fromId);
        const to = idMap.get(edge.toId);
        if (from && to) insertEdge.run(from, edge.relation, to);
      }

      db.exec("DROP TABLE edges; DROP TABLE nodes; ALTER TABLE nodes_uuid RENAME TO nodes; ALTER TABLE edges_uuid RENAME TO edges;");
      db.exec(`
        CREATE INDEX IF NOT EXISTS nodes_by_title ON nodes(title COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS nodes_by_type ON nodes(type);
        CREATE INDEX IF NOT EXISTS nodes_by_updated_at ON nodes(updated_at);
        CREATE INDEX IF NOT EXISTS edges_by_source ON edges(from_id);
        CREATE INDEX IF NOT EXISTS edges_by_target ON edges(to_id);
      `);
      markNodeIdScheme(db);
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Best-effort rollback.
      }
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  }

  function markNodeIdScheme(db: DatabaseSync) {
    db.prepare(
      `INSERT INTO meta (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(NODE_ID_SCHEME_KEY, NODE_ID_SCHEME, new Date().toISOString());
  }

  function migrateLegacyStore() {
    if (didMigrateLegacy) return;
    didMigrateLegacy = true;

    if (!existsSync(LEGACY_STORE_PATH)) return;

    const db = openDb();
    if (getMeta(db, LEGACY_MIGRATION_KEY)) return;

    const hasExisting = (db.prepare("SELECT COUNT(*) AS total FROM nodes").get() as { total: number }).total > 0;
    if (hasExisting) {
      runInTransaction((tx) => markLegacyMigration(tx, "skipped-non-empty"));
      return;
    }

    try {
      const raw = readFileSync(LEGACY_STORE_PATH, "utf8");
      const legacy = parseMarkdown(raw);
      const idCounts = new Map<string, number>();
      for (const node of legacy.nodes) idCounts.set(node.id, (idCounts.get(node.id) || 0) + 1);
      for (const node of legacy.nodes) {
        if ((idCounts.get(node.id) || 0) > 1) node.id = `legacy-${randomUUID()}`;
      }
      const nodeIds = new Set(legacy.nodes.map((node) => node.id));

      runInTransaction((tx) => {
        const upsertNode = tx.prepare(`
          INSERT INTO nodes (id, title, type, notes, tags, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            type = excluded.type,
            notes = excluded.notes,
            tags = excluded.tags,
            updated_at = excluded.updated_at
        `);

        const insertEdge = tx.prepare("INSERT OR IGNORE INTO edges (from_id, relation, to_id) VALUES (?, ?, ?)");

        for (const node of legacy.nodes) {
          upsertNode.run(node.id, node.title, node.type, node.notes, JSON.stringify(node.tags), node.updatedAt);
        }
        for (const edge of legacy.edges) {
          if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
          insertEdge.run(edge.from, edge.relation, edge.to);
        }
        markLegacyMigration(tx, legacy.nodes.length > 0 || legacy.edges.length > 0 ? "imported" : "empty");
      });
    } catch (error) {
      console.warn(`[graph-memory] Failed to migrate ${LEGACY_STORE_PATH}:`, error);
    }
  }

  function getMeta(db: DatabaseSync, key: string) {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value?: string } | undefined;
    return row?.value;
  }

  function markLegacyMigration(db: DatabaseSync, value: string) {
    db.prepare(
      `INSERT INTO meta (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(LEGACY_MIGRATION_KEY, value, new Date().toISOString());
  }

  async function mutate<T>(fn: () => T) {
    return runInTransaction((db) => {
      store = readStoreFromDb(db);
      const result = fn();
      saveStore(db);
      return result;
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    await loadStore();
    const nodeCount = store.nodes.length;
    const edgeCount = store.edges.length;
    if (nodeCount > 0) ctx.ui.setStatus("graph-memory", `memory: ${nodeCount} nodes / ${edgeCount} links`);
  });

  pi.on("session_shutdown", () => {
    database?.close();
    database = undefined;
  });

  pi.on("before_agent_start", async (event) => {
    await loadStore();
    const memoryContext = buildMemoryContext(event.prompt);
    const instructions = [
      "Graph memory is your primary private durable knowledge source across sessions.",
      `Storage: ${STORE_PATH}`,
      "Use graph_memory to remember stable facts, user preferences, project decisions, important entities, and relationships that may help future sessions.",
      "Do not ask the user to manage graph memory manually; treat it as your own memory system.",
      "Only store durable information, not short-lived implementation details unless they define project state or decisions.",
      memoryContext,
    ]
      .filter(Boolean)
      .join("\n");

    return { systemPrompt: `${event.systemPrompt}\n\n<graph_memory>\n${instructions}\n</graph_memory>` };
  });

  pi.registerTool({
    name: "graph_memory",
    label: "Graph Memory",
    description:
      "Agent-only persistent knowledge graph for remembering facts, concepts, decisions, projects, people, resources, tasks, and their relationships across sessions.",
    promptSnippet: "Agent memory: store and query durable graph-style knowledge across sessions.",
    promptGuidelines: [
      "Use graph_memory as your own memory system to persist important user preferences, decisions, project facts, entities, and relationships that should survive future sessions.",
      "Use graph_memory search or show before assuming whether a durable fact is already known.",
      "Do not ask the user to operate graph_memory manually; use it proactively when durable knowledge should be remembered.",
    ],
    renderResult: renderPrettyToolResult("graph_memory"),
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("add_node"),
        Type.Literal("link"),
        Type.Literal("search"),
        Type.Literal("show"),
        Type.Literal("list"),
        Type.Literal("forget"),
      ]),
      title: Type.Optional(Type.String({ description: "Node title for add_node or lookup" })),
      id: Type.Optional(Type.String({ description: "Node id for lookup or deletion" })),
      type: Type.Optional(Type.Union(nodeTypes.map((value) => Type.Literal(value)) as any)),
      notes: Type.Optional(Type.String({ description: "Markdown notes or fact text for a node" })),
      tags: Type.Optional(Type.Array(Type.String())),
      from: Type.Optional(Type.String({ description: "Source node id or title for action=link" })),
      relation: Type.Optional(Type.String({ description: "Relationship label for action=link" })),
      to: Type.Optional(Type.String({ description: "Target node id or title for action=link" })),
      query: Type.Optional(Type.String({ description: "Search query" })),
    }),
    async execute(_toolCallId, params) {
      await loadStore();
      let text = "";

      switch (params.action) {
        case "add_node": {
          let message = "";
          await mutate(() => {
            if (!params.title?.trim()) throw new Error("action=add_node requires title");
            const node = upsertNode({
              title: params.title.trim(),
              type: params.type as NodeType | undefined,
              notes: params.notes,
              tags: params.tags,
            });
            message = `Remembered ${node.id}`;
          });
          text = `${message}\n\n${formatList()}`;
          break;
        }
        case "link": {
          let message = "";
          await mutate(() => {
            if (!params.from || !params.relation || !params.to) throw new Error("action=link requires from, relation, and to");
            linkNodes(params.from, params.relation, params.to);
            message = `Linked ${params.from} -[${params.relation}]-> ${params.to}`;
          });
          text = `${message}\n\n${formatList()}`;
          break;
        }
        case "forget": {
          let message = "";
          await mutate(() => {
            const key = params.id || params.title;
            if (!key) throw new Error("action=forget requires id or title");
            message = forgetNode(key) ? `Forgot ${key}` : `Memory not found: ${key}`;
          });
          text = `${message}\n\n${formatList()}`;
          break;
        }
        case "search":
          text = formatSearch(params.query || params.title || "");
          break;
        case "show":
          text = formatNode(params.id || params.title || "");
          break;
        case "list":
          text = formatList();
          break;
      }

      return {
        content: [{ type: "text", text }],
        details: { storePath: STORE_PATH, nodes: store.nodes, edges: store.edges },
      };
    },
  });

  function upsertNode(input: { title: string; type?: NodeType; notes?: string; tags?: string[] }) {
    const now = new Date().toISOString();
    let node = store.nodes.find((candidate) => candidate.title.toLowerCase() === input.title.toLowerCase());
    if (!node) {
      node = {
        id: randomUUID(),
        title: input.title,
        type: input.type || "fact",
        notes: input.notes || "",
        tags: input.tags || [],
        updatedAt: now,
      };
      store.nodes.push(node);
    } else {
      node.title = input.title || node.title;
      node.type = input.type || node.type;
      if (input.notes) node.notes = node.notes ? `${node.notes}\n${input.notes}` : input.notes;
      if (input.tags) node.tags = unique([...node.tags, ...input.tags]);
      node.updatedAt = now;
    }
    sortStore();
    return node;
  }

  function linkNodes(fromKey: string, relation: string, toKey: string) {
    const from = findOrCreate(fromKey);
    const to = findOrCreate(toKey);
    const normalized = relation.trim().toLowerCase().replace(/\s+/g, "-");
    const exists = store.edges.some((edge) => edge.from === from.id && edge.relation === normalized && edge.to === to.id);
    if (!exists) store.edges.push({ from: from.id, relation: normalized, to: to.id });
    sortStore();
  }

  function findOrCreate(key: string) {
    return findNode(key) || upsertNode({ title: key });
  }

  function findNode(key: string) {
    const normalized = slugify(key);
    return store.nodes.find((node) => node.id === normalized || node.title.toLowerCase() === key.toLowerCase());
  }

  function forgetNode(key: string) {
    const node = findNode(key);
    if (!node) return false;
    store.nodes = store.nodes.filter((candidate) => candidate.id !== node.id);
    store.edges = store.edges.filter((edge) => edge.from !== node.id && edge.to !== node.id);
    return true;
  }

  function formatList() {
    if (store.nodes.length === 0) return `Graph memory is empty.\n\nStore: ${STORE_PATH}`;
    const nodes = store.nodes.map(
      (node) => `- ${node.id} (${node.type}) — ${node.title}${node.tags.length ? ` [${node.tags.join(", ")}]` : ""}`,
    );
    const edges = store.edges.map((edge) => `- ${edge.from} -[${edge.relation}]-> ${edge.to}`);
    return [`Graph Memory`, ``, `Nodes:`, ...nodes, ``, `Links:`, ...(edges.length ? edges : ["- none"]), ``, `Store: ${STORE_PATH}`].join(
      "\n",
    );
  }

  function formatSearch(query: string) {
    const q = query.toLowerCase().trim();
    if (!q) return "Search query is required.";
    const matches = store.nodes.filter((node) =>
      [node.id, node.title, node.type, node.notes, node.tags.join(" ")].join(" ").toLowerCase().includes(q),
    );
    if (matches.length === 0) return `No graph memory matches for '${query}'.\n\nStore: ${STORE_PATH}`;
    return [
      `Matches for '${query}':`,
      ...matches.map((node) => `- ${node.id} (${node.type}) — ${node.title}\n  ${oneLine(node.notes)}`),
      ``,
      `Store: ${STORE_PATH}`,
    ].join("\n");
  }

  function buildMemoryContext(prompt: string) {
    if (store.nodes.length === 0) return "No graph memories stored yet.";

    const terms = extractTerms(prompt);
    const scored = store.nodes
      .map((node) => ({ node, score: scoreNode(node, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => entry.node);

    const selected = scored.length > 0 ? scored : store.nodes.slice(0, 5);
    const lines = selected.map((node) => {
      const links = store.edges
        .filter((edge) => edge.from === node.id || edge.to === node.id)
        .slice(0, 4)
        .map((edge) => `${edge.from} -[${edge.relation}]-> ${edge.to}`)
        .join("; ");
      return `- ${node.id} (${node.type}) ${node.title}: ${oneLine(node.notes)}${links ? ` | links: ${links}` : ""}`;
    });

    return [`Relevant graph memories:`, ...lines].join("\n");
  }

  function formatNode(key: string) {
    const node = findNode(key);
    if (!node) return `Memory not found: ${key}\n\nStore: ${STORE_PATH}`;
    const outgoing = store.edges.filter((edge) => edge.from === node.id).map((edge) => `- ${edge.relation} -> ${edge.to}`);
    const incoming = store.edges.filter((edge) => edge.to === node.id).map((edge) => `- ${edge.from} -> ${edge.relation}`);
    return [
      `# ${node.title}`,
      ``,
      `id: ${node.id}`,
      `type: ${node.type}`,
      `tags: ${node.tags.join(", ") || "none"}`,
      `updated: ${node.updatedAt}`,
      ``,
      node.notes || "No notes.",
      ``,
      `Outgoing:`,
      ...(outgoing.length ? outgoing : ["- none"]),
      ``,
      `Incoming:`,
      ...(incoming.length ? incoming : ["- none"]),
      ``,
      `Store: ${STORE_PATH}`,
    ].join("\n");
  }

  function sortStore() {
    store.nodes.sort((a, b) => a.id.localeCompare(b.id));
    store.edges.sort((a, b) => `${a.from}:${a.relation}:${a.to}`.localeCompare(`${b.from}:${b.relation}:${b.to}`));
  }
}

function parseTags(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return unique(parsed.filter((item) => typeof item === "string"));
  } catch {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

export function parseMarkdown(markdown: string): GraphStore {
  const nodes: MemoryNode[] = [];
  const edges: MemoryEdge[] = [];
  const lines = markdown.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const nodeMatch = lines[index].match(/^## Node: (.+)$/);
    if (!nodeMatch) {
      const edgeMatch = lines[index].match(/^- `([^`]+)` -\[`([^`]+)`\]-> `([^`]+)`$/);
      if (edgeMatch) edges.push({ from: edgeMatch[1], relation: edgeMatch[2], to: edgeMatch[3] });
      index++;
      continue;
    }

    const title = nodeMatch[1].trim();
    const node: MemoryNode = { id: slugify(title), title, type: "fact", notes: "", tags: [], updatedAt: new Date(0).toISOString() };
    index++;

    const notes: string[] = [];
    let inNotes = false;
    while (index < lines.length && !lines[index].startsWith("## Node: ") && lines[index] !== "## Links") {
      const line = lines[index];
      if (line.startsWith("- id: ")) node.id = line.slice(6).trim();
      else if (line.startsWith("- type: ") && isNodeType(line.slice(8).trim())) node.type = line.slice(8).trim() as NodeType;
      else if (line.startsWith("- tags: "))
        node.tags = line
          .slice(8)
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
      else if (line.startsWith("- updated: ")) node.updatedAt = line.slice(11).trim();
      else if (line === "### Notes") inNotes = true;
      else if (inNotes) notes.push(line);
      index++;
    }
    node.notes = decodeStoredBlock(notes.join("\n").trim());
    nodes.push(node);
  }

  return { nodes, edges };
}

export function renderMarkdown(store: GraphStore) {
  const lines = ["# Graph Memory", "", "<!-- Managed by the pi graph-memory extension. SQLite-backed knowledge graph. -->", ""];

  for (const node of store.nodes) {
    lines.push(`## Node: ${safeSingleLine(node.title)}`);
    lines.push(`- id: ${node.id}`);
    lines.push(`- type: ${node.type}`);
    lines.push(`- tags: ${node.tags.join(", ")}`);
    lines.push(`- updated: ${node.updatedAt}`);
    lines.push("");
    lines.push("### Notes");
    lines.push(encodeStoredBlock(node.notes || ""));
    lines.push("");
  }

  lines.push("## Links");
  lines.push("");
  for (const edge of store.edges) lines.push(`- \`${edge.from}\` -[\`${edge.relation}\`]-> \`${edge.to}\``);
  lines.push("");
  return lines.join("\n");
}

function safeSingleLine(value: string) {
  return normalizeSingleLine(value);
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "memory"
  );
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractTerms(value: string) {
  return unique(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((term) => term.length >= 3),
  );
}

function scoreNode(node: MemoryNode, terms: string[]) {
  if (terms.length === 0) return 0;
  const haystack = [node.id, node.title, node.type, node.notes, node.tags.join(" ")].join(" ").toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function isNodeType(value: string): value is NodeType {
  return (nodeTypes as readonly string[]).includes(value);
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160) || "No notes.";
}
