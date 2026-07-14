export type ContextMode = "fresh" | "recent";
export type AgentDef = {
  name: string;
  runtimeName: string;
  description?: string;
  body: string;
  source: "built-in" | "custom";
  scope?: string;
  defaultContext?: "fresh" | "fork" | string;
  readOnly?: boolean;
};
export type ParallelTask = {
  agent: string;
  task: string;
  cwd?: string;
  output?: string | boolean;
  count?: number;
  contextMode?: ContextMode;
};
export type SubagentRunOptions = { contextMode?: ContextMode; parentContext?: string; parentContextLimit?: number };
export type RunRecord = {
  agent: string;
  task: string;
  ok: boolean;
  text: string;
  stderr?: string;
  output?: string;
  error?: string;
  index: number;
};
export type ToolResult = { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown>; isError: boolean };
