import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

const STORE_DIR = join(homedir(), ".pi", "agent", "todos");
const LEGACY_STORE_PATH = join(homedir(), ".pi", "agent", "todo.md");
const DISPLAY_LIMIT = 5;

type TodoStatus = "pending" | "in_progress" | "completed";

type TodoItem = {
  id: number;
  text: string;
  status: TodoStatus;
};

const statusIcon: Record<TodoStatus, string> = {
  pending: "○",
  in_progress: "◐",
  completed: "✓",
};

const markdownMarker: Record<TodoStatus, string> = {
  pending: " ",
  in_progress: "-",
  completed: "x",
};

export default function todo(pi: ExtensionAPI) {
  let items: TodoItem[] = [];
  let nextId = 1;
  let storePath = sessionStorePath();

  function setSessionStore(ctx?: { sessionManager?: { getSessionFile?: () => string | undefined } }) {
    storePath = sessionStorePath(ctx?.sessionManager?.getSessionFile?.());
  }

  async function loadStore(ctx?: { sessionManager?: { getSessionFile?: () => string | undefined } }) {
    setSessionStore(ctx);
    try {
      const raw = await readFile(storePath, "utf8");
      items = parseMarkdown(raw);
      const maxId = items.reduce((max, item) => Math.max(max, item.id), 0);
      nextId = maxId + 1;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "ENOENT") {
        console.warn(`[todo] Failed to read ${storePath}:`, error);
      }
      items = [];
      nextId = 1;
    }
  }

  async function saveStore() {
    await mkdir(dirname(storePath), { recursive: true });
    await writeFile(storePath, renderMarkdown(items), "utf8");
  }

  function visibleItems() {
    const visible = [...items];

    while (visible.length > DISPLAY_LIMIT) {
      const completedIndex = visible.findIndex((item) => item.status === "completed");
      if (completedIndex === -1) break;
      visible.splice(completedIndex, 1);
    }

    return visible.length > DISPLAY_LIMIT ? visible.slice(0, DISPLAY_LIMIT) : visible;
  }

  function openItems() {
    return items.filter((item) => item.status !== "completed");
  }

  function progressSummary() {
    const completed = items.filter((item) => item.status === "completed").length;
    const open = items.length - completed;
    return `${completed}/${items.length} done, ${open} open`;
  }

  function renderLines() {
    const openCount = openItems().length;
    if (openCount === 0) return [];

    const visible = visibleItems();
    if (visible.length === 0) return [];

    const hiddenCount = Math.max(0, items.length - visible.length);
    const lines = [`Todo (${progressSummary()})`];
    for (const item of visible) {
      lines.push(`${statusIcon[item.status]} #${item.id} ${item.text}`);
    }
    if (hiddenCount > 0) {
      lines.push(`… ${hiddenCount} hidden${openCount > DISPLAY_LIMIT ? ` (${openCount} open)` : ""}`);
    }
    return lines;
  }

  function updateWidget(ctx?: { ui?: { setWidget?: (key: string, lines: string[]) => void } }) {
    ctx?.ui?.setWidget?.("todo", renderLines());
  }

  async function mutate<T>(fn: () => T | Promise<T>, ctx?: { ui?: { setWidget?: (key: string, lines: string[]) => void } }) {
    const result = await fn();
    await saveStore();
    updateWidget(ctx);
    return result;
  }

  pi.on("session_start", async (_event, ctx) => {
    await loadStore(ctx);
    updateWidget(ctx);
  });

  pi.on("agent_start", async (_event, ctx) => {
    await loadStore(ctx);
    updateWidget(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    await loadStore(ctx);
    const active = openItems();
    const visible = visibleItems();
    const instructions = [
      "Todo is your private durable task list across sessions.",
      `Storage: ${storePath}`,
      `Legacy global store, no longer used for new session todos: ${LEGACY_STORE_PATH}`,
      "Use the todo tool to track multi-step work, user requests that remain open, and follow-up tasks that should survive future sessions.",
      "Do not ask the user to manage todo manually; treat it as your own persistent task system.",
      "Keep todo current: add tasks when work should be remembered, start tasks when actively working, complete tasks when finished, and clear completed tasks when appropriate.",
      visible.length === 0
        ? "No todos."
        : [
            `Visible todo window (${visible.length}/${DISPLAY_LIMIT}; ${progressSummary()}; completed items stay visible until space is needed):`,
            ...visible.map((item) => `- ${statusIcon[item.status]} #${item.id} ${item.status}: ${item.text}`),
          ].join("\n"),
      active.length === 0
        ? "No active todos."
        : [`Active todos:`, ...active.map((item) => `- ${statusIcon[item.status]} #${item.id} ${item.status}: ${item.text}`)].join("\n"),
    ].join("\n");

    return { systemPrompt: `${event.systemPrompt}\n\n<todo>\n${instructions}\n</todo>` };
  });

  pi.registerTool({
    name: "todo",
    label: "Todo",
    description: "Agent-only persistent markdown todo list shown in the pi TUI when active tasks exist.",
    promptSnippet: "Agent todo memory: manage durable markdown todos displayed in the TUI widget.",
    promptGuidelines: [
      "Use todo as your own persistent task system for multi-step work, open user requests, and follow-up tasks that should survive future sessions.",
      "Do not ask the user to operate todo manually; use it proactively and keep it current.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list"),
        Type.Literal("add"),
        Type.Literal("start"),
        Type.Literal("pending"),
        Type.Literal("complete"),
        Type.Literal("clear_completed"),
      ]),
      text: Type.Optional(Type.String({ description: "Todo text for action=add" })),
      id: Type.Optional(Type.Number({ description: "Todo id for start, pending, or complete" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      await loadStore(ctx);

      let message = "";
      await mutate(() => {
        switch (params.action) {
          case "add": {
            if (!params.text?.trim()) throw new Error("action=add requires text");
            const item = addTodo(sanitizeTodoText(params.text));
            message = `Added todo #${item.id}`;
            break;
          }
          case "start":
          case "pending":
          case "complete": {
            if (!Number.isInteger(params.id)) throw new Error(`action=${params.action} requires id`);
            const status = params.action === "complete" ? "completed" : params.action === "start" ? "in_progress" : "pending";
            const item = setStatus(params.id!, status);
            message = item ? `Updated todo #${params.id}` : `Todo #${params.id} not found`;
            break;
          }
          case "clear_completed": {
            const removed = clearCompleted();
            message = `Removed ${removed} completed todo(s)`;
            break;
          }
          case "list":
            message = "Todos listed";
            break;
        }
      }, ctx);

      return {
        content: [{ type: "text", text: `${message}\n\n${formatTodos()}` }],
        details: { todos: items, storePath, legacyStorePath: LEGACY_STORE_PATH },
      };
    },
  });

  function addTodo(text: string) {
    const item: TodoItem = { id: nextId++, text, status: "pending" };
    items.push(item);
    return item;
  }

  function setStatus(id: number, status: TodoStatus) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return undefined;
    item.status = status;
    return item;
  }

  function clearCompleted() {
    const before = items.length;
    items = items.filter((item) => item.status !== "completed");
    return before - items.length;
  }

  function formatTodos() {
    if (items.length === 0) return `No todos.\n\nStore: ${storePath}`;
    return `${renderMarkdown(items).trim()}\n\nStore: ${storePath}`;
  }
}

function sessionStorePath(sessionFile?: string) {
  const key = sessionFile || "ephemeral";
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return join(STORE_DIR, `${hash}.md`);
}

export function parseMarkdown(markdown: string): TodoItem[] {
  const parsed: TodoItem[] = [];
  const taskPattern = /^- \[([ xX-])\] #?(\d+)\s+(.+)$/;

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(taskPattern);
    if (!match) continue;

    const marker = match[1];
    const status: TodoStatus = marker === "x" || marker === "X" ? "completed" : marker === "-" ? "in_progress" : "pending";

    parsed.push({
      id: Number(match[2]),
      text: sanitizeTodoText(match[3]),
      status,
    });
  }

  return parsed;
}

export function renderMarkdown(items: TodoItem[]) {
  const completed = items.filter((item) => item.status === "completed").length;
  const open = items.length - completed;
  const lines = [
    `# Todo (${completed}/${items.length} done, ${open} open)`,
    "",
    "<!-- Managed by the pi todo extension. Edit carefully; supported markers are [ ], [-], and [x]. -->",
    "",
  ];

  for (const item of items) {
    lines.push(`- [${markdownMarker[item.status]}] #${item.id} ${sanitizeTodoText(item.text)}`);
  }

  return lines.join("\n") + "\n";
}

export function sanitizeTodoText(value: string | undefined) {
  return (value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
