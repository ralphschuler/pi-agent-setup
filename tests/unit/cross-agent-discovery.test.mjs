import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverCrossAgentResources } from "../../extensions/cross-agent/discovery.ts";
import { readCustomAgents } from "../../extensions/custom-agents/registry.ts";

function write(file, text = "x") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

test("cross-agent discovery registers authored prompts, skills, and agents only", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cross-agent-home-"));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cross-agent-project-"));
  const cwd = path.join(project, "nested");
  fs.mkdirSync(cwd, { recursive: true });

  write(path.join(home, ".claude", "commands", "review.md"));
  write(path.join(project, ".gemini", "prompts", "plan.md"));
  write(path.join(home, ".codex", "skills", "writer", "SKILL.md"), "---\nname: writer\ndescription: Write things\n---\n");
  write(path.join(home, ".codex", "skills", ".system", "vendor", "SKILL.md"), "---\nname: vendor\ndescription: Skip\n---\n");
  write(path.join(project, ".claude", "agents", "reader.md"), "---\nname: reader\ndescription: Read-only agent\n---\n\nRead.");
  write(path.join(project, ".claude", "sessions", "noise.md"));

  const resources = await discoverCrossAgentResources(cwd, home);

  assert.deepEqual(resources.promptPaths, [path.join(home, ".claude", "commands"), path.join(project, ".gemini", "prompts")].sort());
  assert.deepEqual(resources.skillPaths, [path.join(home, ".codex", "skills", "writer", "SKILL.md")]);
  assert.deepEqual(resources.agentRoots, [path.join(project, ".claude", "agents")]);
});

test("custom agent registry includes cross-agent markdown agents with provenance", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cross-agent-home-"));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cross-agent-project-"));
  write(
    path.join(project, ".claude", "agents", "reader.md"),
    "---\nname: reader\npackage: claude\ndescription: Read-only agent\n---\n\nRead.",
  );

  const oldHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const agents = await readCustomAgents(project);
    const agent = agents.find((entry) => entry.runtimeName === "claude.reader");
    assert.ok(agent);
    assert.equal(agent?.origin, "cross-agent");
    assert.equal(agent?.description, "Read-only agent");
  } finally {
    process.env.HOME = oldHome;
  }
});
