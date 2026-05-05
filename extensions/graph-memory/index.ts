import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { decodeStoredBlock, encodeStoredBlock, normalizeSingleLine } from "../shared/markdown-store-codec.ts";
import { renderPrettyToolResult } from "../shared/pretty-render.ts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const STORE_PATH = join(homedir(), ".pi", "agent", "graph-memory.md");

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

export default function graphMemory(pi: ExtensionAPI) {
  let store: GraphStore = { nodes: [], edges: [] };

  async function loadStore() {
    try {
      const raw = await readFile(STORE_PATH, "utf8");
      store = parseMarkdown(raw);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "ENOENT") console.warn(`[graph-memory] Failed to read ${STORE_PATH}:`, error);
      store = { nodes: [], edges: [] };
    }
  }

  async function saveStore() {
    await mkdir(dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, renderMarkdown(store), "utf8");
  }

  async function mutate<T>(fn: () => T | Promise<T>) {
    const result = await fn();
    await saveStore();
    return result;
  }

  pi.on("session_start", async (_event, ctx) => {
    await loadStore();
    const nodeCount = store.nodes.length;
    const edgeCount = store.edges.length;
    if (nodeCount > 0) ctx.ui.setStatus("graph-memory", `memory: ${nodeCount} nodes / ${edgeCount} links`);
  });

  pi.on("before_agent_start", async (event) => {
    await loadStore();
    const memoryContext = buildMemoryContext(event.prompt);
    const instructions = [
      "Graph memory is your private durable knowledge graph across sessions.",
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
      let message = "";

      await mutate(() => {
        switch (params.action) {
          case "add_node": {
            if (!params.title?.trim()) throw new Error("action=add_node requires title");
            const node = upsertNode({
              title: params.title.trim(),
              type: params.type as NodeType | undefined,
              notes: params.notes,
              tags: params.tags,
            });
            message = `Remembered ${node.id}`;
            break;
          }
          case "link": {
            if (!params.from || !params.relation || !params.to) throw new Error("action=link requires from, relation, and to");
            linkNodes(params.from, params.relation, params.to);
            message = `Linked ${params.from} -[${params.relation}]-> ${params.to}`;
            break;
          }
          case "forget": {
            const key = params.id || params.title;
            if (!key) throw new Error("action=forget requires id or title");
            message = forgetNode(key) ? `Forgot ${key}` : `Memory not found: ${key}`;
            break;
          }
          case "search":
          case "show":
          case "list":
            message = "Memory queried";
            break;
        }
      });

      let text = message;
      if (params.action === "search") text = formatSearch(params.query || params.title || "");
      if (params.action === "show") text = formatNode(params.id || params.title || "");
      if (params.action === "list") text = formatList();
      if (params.action === "add_node" || params.action === "link" || params.action === "forget") text = `${message}\n\n${formatList()}`;

      return {
        content: [{ type: "text", text }],
        details: { storePath: STORE_PATH, nodes: store.nodes, edges: store.edges },
      };
    },
  });

  function upsertNode(input: { title: string; type?: NodeType; notes?: string; tags?: string[] }) {
    const now = new Date().toISOString();
    const id = slugify(input.title);
    let node = store.nodes.find((candidate) => candidate.id === id);
    if (!node) {
      node = { id, title: input.title, type: input.type || "fact", notes: input.notes || "", tags: input.tags || [], updatedAt: now };
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
  const lines = ["# Graph Memory", "", "<!-- Managed by the pi graph-memory extension. This is a simple markdown knowledge graph. -->", ""];

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
