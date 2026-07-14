// @ts-nocheck
import { deleteCustomAgent, readCustomAgents, type AgentScope, writeCustomAgent } from "../custom-agents/registry.ts";
import { textResult } from "./result.ts";
import type { AgentDef } from "./types.ts";

export const BUILTIN_AGENTS = [
  {
    name: "scout",
    description: "Read-only codebase reconnaissance. Finds relevant files, APIs, tests, and constraints.",
    prompt: "You are a read-only scout. Inspect files directly, summarize evidence with paths, and do not modify files.",
  },
  {
    name: "planner",
    description: "Breaks a task into an implementation plan with risks, dependencies, and validation steps.",
    prompt:
      "You are a planner. Produce a concise, ordered plan split into small feature phases that are independently and quickly testable. Include assumptions, risks, acceptance criteria, quick validation commands/checks, and rollback/stop points. Do not modify files.",
  },
  {
    name: "reviewer",
    description: "Independent review for bugs, regressions, missing tests, and maintainability risks.",
    prompt: "You are a critical reviewer. Look for concrete issues, cite evidence, and separate must-fix findings from suggestions.",
  },
  {
    name: "worker",
    description: "Focused implementation assistant. Use only when the parent explicitly delegates a bounded task.",
    prompt: "You are a focused implementation worker. Make only requested changes, keep diffs small, and report validation performed.",
  },
  {
    name: "researcher",
    description: "General technical research and synthesis for unfamiliar APIs, designs, or options.",
    prompt: "You are a researcher. Gather relevant context, compare options, cite sources or file paths, and produce a concise synthesis.",
  },
];

export async function allAgents(cwd: string): Promise<AgentDef[]> {
  const builtins = BUILTIN_AGENTS.map((agent) => ({
    ...agent,
    runtimeName: agent.name,
    body: agent.prompt,
    source: "built-in" as const,
    defaultContext: "fresh",
    readOnly: ["scout", "planner", "reviewer", "researcher"].includes(agent.name),
  }));
  const custom = (await readCustomAgents(cwd)).map((agent) => ({
    name: agent.name,
    runtimeName: agent.runtimeName,
    description: agent.description,
    body: agent.body,
    source: "custom" as const,
    scope: agent.scope,
    defaultContext: agent.defaultContext,
    readOnly: agent.readOnly,
  }));
  return [...builtins, ...custom].sort((a, b) => a.runtimeName.localeCompare(b.runtimeName));
}

export async function listAgents(cwd: string) {
  const agents = await allAgents(cwd);
  const text = agents
    .map(
      (agent) =>
        `- ${agent.runtimeName} (${agent.source}${agent.scope ? `, ${agent.scope}` : ""}) — ${agent.description || "No description"}`,
    )
    .join("\n");
  return textResult(text || "No subagents available.", { action: "list", agents });
}

export async function createAgent(cwd: string, config?: string) {
  if (!config) throw new Error("subagent create requires config JSON.");
  const parsed = JSON.parse(config);
  const created = await writeCustomAgent(cwd, {
    name: parsed.name,
    package: parsed.package || "custom",
    description: parsed.description || "Custom subagent.",
    scope: (parsed.scope || "project") as AgentScope,
    systemPrompt:
      parsed.systemPrompt || parsed.prompt || "You are a specialized subagent. Complete the delegated task and report concise results.",
    model: parsed.model,
    thinking: parsed.thinking,
    tools: parsed.tools,
    skills: parsed.skills,
    defaultContext: parsed.defaultContext || "fresh",
    inheritProjectContext: parsed.inheritProjectContext ?? true,
    inheritSkills: parsed.inheritSkills ?? true,
    systemPromptMode: parsed.systemPromptMode || "replace",
    readOnly: parsed.readOnly === true,
  });
  return textResult(`Created ${created.runtimeName}\n${created.path}`, { action: "create", created });
}

export async function deleteAgent(cwd: string, agent?: string) {
  if (!agent) throw new Error("subagent delete requires agent.");
  const deleted = await deleteCustomAgent(cwd, agent);
  return textResult(`Deleted ${deleted.runtimeName}\n${deleted.path}`, { action: "delete", deleted });
}
