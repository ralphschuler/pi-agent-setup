import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const STORE_PATH = join(homedir(), ".pi", "agent", "todo.md");

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

  async function loadStore() {
    try {
      const raw = await readFile(STORE_PATH, "utf8");
      items = parseMarkdown(raw);
      const maxId = items.reduce((max, item) => Math.max(max, item.id), 0);
      nextId = maxId + 1;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "ENOENT") {
        console.warn(`[todo] Failed to read ${STORE_PATH}:`, error);
      }
      items = [];
      nextId = 1;
    }
  }

  async function saveStore() {
    await mkdir(dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, renderMarkdown(items), "utf8");
  }

  function visibleItems() {
    return items.filter((item) => item.status !== "completed");
  }

  function renderLines() {
    const active = visibleItems();
    if (active.length === 0) return [];

    const lines = ["Todo"];
    for (const item of active.slice(0, 8)) {
      lines.push(`${statusIcon[item.status]} #${item.id} ${item.text}`);
    }
    if (active.length > 8) {
      lines.push(`… ${active.length - 8} more`);
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
    await loadStore();
    updateWidget(ctx);
  });

  pi.on("agent_start", async (_event, ctx) => {
    await loadStore();
    updateWidget(ctx);
  });

  pi.on("before_agent_start", async (event) => {
    await loadStore();
    const active = visibleItems();
    const instructions = [
      "Todo is your private durable task list across sessions.",
      `Storage: ${STORE_PATH}`,
      "Use the todo tool to track multi-step work, user requests that remain open, and follow-up tasks that should survive future sessions.",
      "Do not ask the user to manage todo manually; treat it as your own persistent task system.",
      "Keep todo current: add tasks when work should be remembered, start tasks when actively working, complete tasks when finished, and clear completed tasks when appropriate.",
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
      await loadStore();

      let message = "";
      await mutate(() => {
        switch (params.action) {
          case "add": {
            if (!params.text?.trim()) throw new Error("action=add requires text");
            const item = addTodo(params.text.trim());
            message = `Added todo #${item.id}`;
            break;
          }
          case "start":
          case "pending":
          case "complete": {
            if (!Number.isInteger(params.id)) throw new Error(`action=${params.action} requires id`);
            const status = params.action === "complete" ? "completed" : params.action;
            const item = setStatus(params.id!, status as TodoStatus);
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
        details: { todos: items, storePath: STORE_PATH },
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
    if (items.length === 0) return `No todos.\n\nStore: ${STORE_PATH}`;
    return `${renderMarkdown(items).trim()}\n\nStore: ${STORE_PATH}`;
  }
}

function parseMarkdown(markdown: string): TodoItem[] {
  const parsed: TodoItem[] = [];
  const taskPattern = /^- \[([ xX-])\] #?(\d+)\s+(.+)$/;

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(taskPattern);
    if (!match) continue;

    const marker = match[1];
    const status: TodoStatus = marker === "x" || marker === "X"
      ? "completed"
      : marker === "-"
        ? "in_progress"
        : "pending";

    parsed.push({
      id: Number(match[2]),
      text: match[3].trim(),
      status,
    });
  }

  return parsed;
}

function renderMarkdown(items: TodoItem[]) {
  const lines = [
    "# Todo",
    "",
    "<!-- Managed by the pi todo extension. Edit carefully; supported markers are [ ], [-], and [x]. -->",
    "",
  ];

  for (const item of items) {
    lines.push(`- [${markdownMarker[item.status]}] #${item.id} ${item.text}`);
  }

  return lines.join("\n") + "\n";
}
