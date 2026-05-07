import crypto from "node:crypto";

export const ACP_PROTOCOL_VERSION = 1;
export const ADAPTER_NAME = "pi-acp";

export function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

export function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id: id ?? null, error };
}

export function sessionUpdate(sessionId, update) {
  return { jsonrpc: "2.0", method: "session/update", params: { sessionId, update } };
}

export function mapToolKind(name) {
  const lower = String(name || "").toLowerCase();
  if (["read", "grep", "find", "ls"].includes(lower)) return "read";
  if (["edit", "write"].includes(lower)) return "edit";
  if (["bash", "process"].includes(lower)) return "execute";
  if (lower.includes("search")) return "search";
  if (lower.includes("browser") || lower.includes("fetch")) return "fetch";
  if (lower.includes("todo") || lower.includes("memory")) return "other";
  return "other";
}

export function textFromToolResult(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((entry) => entry?.type === "text")
    .map((entry) => String(entry.text || ""))
    .join("\n")
    .slice(0, 12000);
}

export function isDialogUiRequest(event) {
  return event?.type === "extension_ui_request" && ["select", "confirm", "input", "editor"].includes(event.method);
}

export function piEventToAcpNotifications(sessionId, event) {
  if (!event || typeof event !== "object") return [];
  const delta = event.assistantMessageEvent;
  if (event.type === "message_update" && delta?.type === "text_delta") {
    return [sessionUpdate(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: String(delta.delta || "") } })];
  }
  if (event.type === "message_update" && delta?.type === "thinking_delta") {
    return [sessionUpdate(sessionId, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: String(delta.delta || "") } })];
  }
  if (event.type === "tool_execution_start") {
    return [
      sessionUpdate(sessionId, {
        sessionUpdate: "tool_call",
        toolCallId: String(event.toolCallId || crypto.randomUUID()),
        title: `Running ${event.toolName || "tool"}`,
        kind: mapToolKind(event.toolName),
        status: "pending",
        rawInput: event.args ?? null,
      }),
    ];
  }
  if (event.type === "tool_execution_update") {
    return [
      sessionUpdate(sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId: String(event.toolCallId || "unknown"),
        status: "in_progress",
        content: [{ type: "content", content: { type: "text", text: textFromToolResult(event.partialResult) } }],
        rawOutput: event.partialResult ?? null,
      }),
    ];
  }
  if (event.type === "tool_execution_end") {
    return [
      sessionUpdate(sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId: String(event.toolCallId || "unknown"),
        status: event.isError ? "failed" : "completed",
        content: [{ type: "content", content: { type: "text", text: textFromToolResult(event.result) } }],
        rawOutput: event.result ?? null,
      }),
    ];
  }
  if (event.type === "extension_ui_request") {
    return [
      sessionUpdate(sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: `\n[pi-acp blocked extension UI request: ${event.method || "unknown"}. Continue this session in Pi terminal for user interaction.]\n`,
        },
      }),
    ];
  }
  return [];
}
