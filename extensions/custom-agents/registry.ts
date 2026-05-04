import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type AgentScope = "user" | "project";

type AgentRoot = {
  scope: AgentScope;
  path: string;
  preferred: boolean;
};

export type CustomAgentInfo = {
  name: string;
  runtimeName: string;
  package?: string;
  description?: string;
  scope: AgentScope;
  path: string;
  model?: string;
  thinking?: string;
  defaultContext?: string;
  tools?: string;
  skills?: string;
  systemPromptMode?: string;
  body: string;
  frontmatter: Record<string, string>;
};

export type AgentDraft = {
  name: string;
  package?: string;
  description: string;
  scope: AgentScope;
  systemPrompt: string;
  model?: string;
  thinking?: string;
  tools?: string;
  skills?: string;
  defaultContext?: "fresh" | "fork";
  inheritProjectContext?: boolean;
  inheritSkills?: boolean;
  systemPromptMode?: "replace" | "append";
};

async function isDirectory(p: string) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function findNearestProjectRoot(cwd: string) {
  let currentDir = path.resolve(cwd);
  while (true) {
    if (await isDirectory(path.join(currentDir, ".pi")) || await isDirectory(path.join(currentDir, ".agents"))) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

export async function agentRoots(cwd: string): Promise<AgentRoot[]> {
  const userOld = path.join(os.homedir(), ".pi", "agent", "agents");
  const userNew = path.join(os.homedir(), ".agents");
  const userPreferred = await isDirectory(userNew) ? userNew : userOld;
  const roots: AgentRoot[] = [
    { scope: "user", path: userOld, preferred: userPreferred === userOld },
    { scope: "user", path: userNew, preferred: userPreferred === userNew },
  ];

  const projectRoot = await findNearestProjectRoot(cwd);
  if (projectRoot) {
    const legacyProject = path.join(projectRoot, ".agents");
    const preferredProject = path.join(projectRoot, ".pi", "agents");
    roots.push({ scope: "project", path: legacyProject, preferred: false });
    roots.push({ scope: "project", path: preferredProject, preferred: true });
  } else {
    roots.push({ scope: "project", path: path.join(cwd, ".pi", "agents"), preferred: true });
  }

  return roots;
}

async function preferredAgentRoot(cwd: string, scope: AgentScope) {
  const roots = await agentRoots(cwd);
  return roots.find((root) => root.scope === scope && root.preferred)?.path
    || roots.find((root) => root.scope === scope)?.path
    || path.join(cwd, ".pi", "agents");
}

function parseFrontmatter(text: string) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const frontmatter: Record<string, string> = {};
  if (!match) return { frontmatter, body: text.trim() };
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^['\"]|['\"]$/g, "");
    frontmatter[key] = value;
  }
  return { frontmatter, body: match[2].trim() };
}

async function walkMarkdown(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkMarkdown(full);
      if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.endsWith(".chain.md")) return [full];
      return [];
    }));
    return files.flat();
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function readCustomAgents(cwd: string): Promise<CustomAgentInfo[]> {
  const all: CustomAgentInfo[] = [];
  const seen = new Set<string>();
  for (const root of await agentRoots(cwd)) {
    for (const file of await walkMarkdown(root.path)) {
      const key = path.resolve(file);
      if (seen.has(key)) continue;
      seen.add(key);
      const text = await fs.readFile(file, "utf8");
      const { frontmatter, body } = parseFrontmatter(text);
      const name = frontmatter.name || path.basename(file, ".md");
      const pkg = frontmatter.package || undefined;
      all.push({
        name,
        runtimeName: pkg ? `${pkg}.${name}` : name,
        package: pkg,
        description: frontmatter.description,
        scope: root.scope,
        path: file,
        model: frontmatter.model,
        thinking: frontmatter.thinking,
        defaultContext: frontmatter.defaultContext,
        tools: frontmatter.tools,
        skills: frontmatter.skills,
        systemPromptMode: frontmatter.systemPromptMode,
        frontmatter,
        body,
      });
    }
  }
  return all.sort((a, b) => a.runtimeName.localeCompare(b.runtimeName) || a.scope.localeCompare(b.scope));
}

export function sanitizeAgentName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function yamlLine(key: string, value: unknown) {
  if (value === undefined || value === "") return undefined;
  return `${key}: ${String(value).replace(/\n/g, " ")}`;
}

export async function writeCustomAgent(cwd: string, draft: AgentDraft) {
  const name = sanitizeAgentName(draft.name);
  if (!name) throw new Error("Agent name cannot be empty.");
  const pkg = draft.package ? sanitizeAgentName(draft.package) : undefined;
  const root = await preferredAgentRoot(cwd, draft.scope);
  const runtimeName = pkg ? `${pkg}.${name}` : name;
  const file = path.join(root, `${runtimeName}.md`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const frontmatter = [
    yamlLine("name", name),
    yamlLine("package", pkg),
    yamlLine("description", draft.description),
    yamlLine("model", draft.model),
    yamlLine("thinking", draft.thinking),
    yamlLine("tools", draft.tools),
    yamlLine("skills", draft.skills),
    yamlLine("defaultContext", draft.defaultContext || "fresh"),
    yamlLine("inheritProjectContext", draft.inheritProjectContext ?? true),
    yamlLine("inheritSkills", draft.inheritSkills ?? true),
    yamlLine("systemPromptMode", draft.systemPromptMode || "replace"),
  ].filter(Boolean).join("\n");
  const content = `---\n${frontmatter}\n---\n\n${draft.systemPrompt.trim()}\n`;
  await fs.writeFile(file, content, "utf8");
  return { path: file, runtimeName, name, package: pkg };
}

export async function deleteCustomAgent(cwd: string, runtimeName: string, scope?: AgentScope) {
  const agents = await readCustomAgents(cwd);
  const matches = agents.filter((agent) => agent.runtimeName === runtimeName || agent.name === runtimeName)
    .filter((agent) => !scope || agent.scope === scope);
  if (matches.length === 0) throw new Error(`No custom agent named ${runtimeName} found.`);
  if (matches.length > 1) throw new Error(`Multiple custom agents named ${runtimeName}; specify user or project scope.`);
  await fs.unlink(matches[0].path);
  return matches[0];
}

export function formatAgentCatalog(agents: CustomAgentInfo[]) {
  if (agents.length === 0) return "No custom agents found.";
  return agents.map((agent) => {
    const bits = [agent.scope];
    if (agent.defaultContext) bits.push(`context=${agent.defaultContext}`);
    if (agent.model) bits.push(`model=${agent.model}`);
    if (agent.tools) bits.push(`tools=${agent.tools}`);
    return `- ${agent.runtimeName} (${bits.join(", ")}) — ${agent.description || "No description"}`;
  }).join("\n");
}

export function formatSubagentOrchestrationInstructions(agents: CustomAgentInfo[]) {
  const catalog = formatAgentCatalog(agents);
  return [
    "Custom agent instructions are available from the /agent extension and standard user/project agent folders."
    "Prefer an existing custom agent when its description matches the requested work. Use the runtime name exactly as listed.",
    "If a needed specialist is missing, create it dynamically with subagent action=create before running it. Use these defaults unless the task requires otherwise: package='custom', scope='project', inheritProjectContext=true, inheritSkills=true, defaultContext='fresh', systemPromptMode='replace'.",
    "When creating a missing specialist, derive a narrow name, description, tool limits, success criteria, escalation rules, and output contract from the user's task and the custom-agent catalog style. Then run the newly created agent by its runtime name.",
    "Do not overwrite an existing custom agent unless the user asked to update it; create a more specific runtime name instead.",
    "Current custom agents:",
    catalog,
  ].join("\n");
}
