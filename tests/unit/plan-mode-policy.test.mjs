import assert from "node:assert/strict";
import test from "node:test";

import { isReadOnlyBashCommand, planToolBlockReason } from "../../extensions/plan/policy.ts";

test("plan Bash policy allows bounded inspection commands", () => {
  for (const command of [
    "git status --short --branch",
    "git diff -- extensions/plan/index.ts",
    "git log -5 --oneline",
    "git ls-files",
    "grep -RIn TODO extensions",
    "find extensions -name '*.ts' -type f",
    "sed -n '1,120p' README.md",
    "cat package.json",
    "command -v pi",
  ]) {
    assert.equal(isReadOnlyBashCommand(command), true, command);
  }
});

test("plan Bash policy fails closed for writes and shell indirection", () => {
  for (const command of [
    "echo changed > README.md",
    "sed -i 's/old/new/' README.md",
    "git checkout -- README.md",
    "git apply patch.diff",
    "bash -c 'echo changed > README.md'",
    "node -e \"require('fs').writeFileSync('README.md', 'changed')\"",
    "find . -exec touch marker \\;",
    "grep foo README.md | tee result.txt",
    "npm install example",
  ]) {
    assert.equal(isReadOnlyBashCommand(command), false, command);
  }
});

test("plan tool policy allows read-only planning tools and metadata tools", async () => {
  for (const toolName of [
    "read",
    "grep",
    "find",
    "ls",
    "random_file",
    "package_scout",
    "searxng_status",
    "search",
    "todo",
    "graph_memory",
    "human_in_loop",
  ]) {
    assert.equal(await planToolBlockReason({ toolName, input: {} }, { cwd: process.cwd() }), undefined, toolName);
  }
});

test("plan tool policy blocks write-capable tools and subagent writes", async () => {
  assert.match(
    await planToolBlockReason({ toolName: "bash", input: { command: "echo changed > README.md" } }, { cwd: process.cwd() }),
    /read-only Bash|blocked/i,
  );
  assert.match(
    await planToolBlockReason({ toolName: "subagent", input: { action: "create", config: "{}" } }, { cwd: process.cwd() }),
    /create|write/i,
  );
  assert.match(
    await planToolBlockReason({ toolName: "subagent", input: { agent: "worker", task: "edit files" } }, { cwd: process.cwd() }),
    /read-only|not permitted/i,
  );
  assert.match(
    await planToolBlockReason(
      { toolName: "subagent", input: { agent: "scout", task: "inspect", output: "report.md" } },
      { cwd: process.cwd() },
    ),
    /output|write/i,
  );
  assert.match(await planToolBlockReason({ toolName: "process", input: { action: "start" } }, { cwd: process.cwd() }), /Blocked tool/);
});

test("plan tool policy permits read-only built-in subagents without output paths", async () => {
  for (const agent of ["scout", "planner", "reviewer", "researcher"]) {
    assert.equal(
      await planToolBlockReason({ toolName: "subagent", input: { agent, task: "inspect only" } }, { cwd: process.cwd() }),
      undefined,
      agent,
    );
  }
});
