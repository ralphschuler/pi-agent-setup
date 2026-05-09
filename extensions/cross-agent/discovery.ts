// @ts-nocheck
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const AGENT_DIRS = [".claude", ".gemini", ".codex"] as const;
const PROMPT_DIRS = ["commands", "prompts"];
const EXCLUDED_SEGMENTS = new Set([".system", "sessions", "session", "log", "logs", ".tmp", ".cache"]);

export type CrossAgentResourceSet = {
  promptPaths: string[];
  skillPaths: string[];
  agentRoots: string[];
  roots: string[];
};

async function existsDir(p: string) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function existsFile(p: string) {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => path.resolve(value)))].sort();
}

function hasExcludedSegment(p: string) {
  return p.split(path.sep).some((part) => EXCLUDED_SEGMENTS.has(part));
}

async function findProjectRoots(cwd: string) {
  const roots: string[] = [];
  let current = path.resolve(cwd);
  while (true) {
    for (const dir of AGENT_DIRS) {
      const full = path.join(current, dir);
      if (await existsDir(full)) roots.push(full);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return roots;
}

export async function findCrossAgentRoots(cwd: string, homeDir = os.homedir()) {
  const userRoots = await Promise.all(AGENT_DIRS.map(async (dir) => path.join(homeDir, dir)));
  const projectRoots = await findProjectRoots(cwd);
  const existing: string[] = [];
  for (const root of [...userRoots, ...projectRoots]) {
    if ((await existsDir(root)) && !hasExcludedSegment(root)) existing.push(root);
  }
  return unique(existing);
}

async function collectSkillFiles(dir: string, out: string[]) {
  if (hasExcludedSegment(dir)) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (await existsFile(path.join(dir, "SKILL.md"))) {
    out.push(path.join(dir, "SKILL.md"));
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) await collectSkillFiles(path.join(dir, entry.name), out);
  }
}

async function hasMarkdown(dir: string) {
  if (hasExcludedSegment(dir)) return false;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.endsWith(".md"));
  } catch (error: any) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function discoverCrossAgentResources(cwd: string, homeDir = os.homedir()): Promise<CrossAgentResourceSet> {
  const roots = await findCrossAgentRoots(cwd, homeDir);
  const promptPaths: string[] = [];
  const skillPaths: string[] = [];
  const agentRoots: string[] = [];

  for (const root of roots) {
    for (const promptDir of PROMPT_DIRS) {
      const full = path.join(root, promptDir);
      if ((await existsDir(full)) && !hasExcludedSegment(full)) promptPaths.push(full);
    }
    const skills = path.join(root, "skills");
    if (await existsDir(skills)) await collectSkillFiles(skills, skillPaths);
    const agents = path.join(root, "agents");
    if ((await existsDir(agents)) && (await hasMarkdown(agents))) agentRoots.push(agents);
  }

  return {
    promptPaths: unique(promptPaths),
    skillPaths: unique(skillPaths),
    agentRoots: unique(agentRoots),
    roots,
  };
}
