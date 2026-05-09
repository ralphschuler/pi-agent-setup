import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runAgentRecord } from "../../extensions/subagents/runner.ts";
import { writeOutput } from "../../extensions/subagents/output-writer.ts";
import { readText } from "../helpers.mjs";

test("subagent orchestration is split into focused internal modules", () => {
  const entry = readText("extensions/subagents/index.ts");
  const catalog = readText("extensions/subagents/catalog.ts");
  const scheduler = readText("extensions/subagents/scheduler.ts");
  const runner = readText("extensions/subagents/runner.ts");
  const executor = readText("extensions/subagents/executor.ts");
  const writer = readText("extensions/subagents/output-writer.ts");
  const renderer = readText("extensions/subagents/renderer.ts");

  assert.match(entry, /renderCall: renderSubagentCall/);
  assert.match(entry, /renderResult: renderSubagentResult/);
  assert.match(entry, /runParallel\(pi, ctx\.cwd/);
  assert.match(entry, /runAgentRecord\(pi, ctx\.cwd/);

  assert.match(catalog, /export const BUILTIN_AGENTS/);
  assert.match(catalog, /export async function allAgents/);
  assert.match(catalog, /readCustomAgents\(cwd\)/);
  assert.match(catalog, /\.\.\/custom-agents\/registry\.ts/);

  assert.match(scheduler, /export async function runParallel/);
  assert.match(scheduler, /export function expandTasks/);
  assert.match(scheduler, /Math\.max\(1, Math\.min\(Number\(concurrency\) \|\| 4, expanded\.length\)\)/);

  assert.match(runner, /export async function runAgentRecord/);
  assert.match(runner, /Unknown subagent '\$\{name\}'\. Use action=list first\./);
  assert.match(runner, /createSecretRedactor/);
  assert.match(runner, /redactor\.redactText\(task\)/);
  assert.match(runner, /execSubagentProcess\(\s*agent\.runtimeName/);

  assert.match(executor, /spawnFn\("bash", \["-lc", `pi -p < \$\{shellQuote\(promptFile\)\}`\]/);
  assert.match(executor, /createSubagentLiveUpdate\(agent, task, index, stdout, stderr, onUpdate, redactText\)/);
  assert.match(executor, /redactText\(tailText\(stdout\.join\(""\), 6, 2000\)\)/);
  assert.match(executor, /setTimeout\(emit, 500\)/);

  assert.match(writer, /output\.includes\("\{index\}"\)/);
  assert.match(writer, /fs\.writeFile\(outPath, text, "utf8"\)/);

  assert.match(renderer, /export function subagentDisplayContract/);
  assert.match(renderer, /renderToolDisplayContract\(subagentDisplayContract/);
});

test("subagent runner removes temporary prompt files after execution", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-runner-"));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-bin-"));
  const pi = path.join(binDir, "pi");
  fs.writeFileSync(pi, "#!/usr/bin/env bash\ncat >/dev/null\nprintf 'ok\\n'\n", "utf8");
  fs.chmodSync(pi, 0o755);
  const before = new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.includes(`pi-subagent-`) && name.includes(`-${process.pid}-`)));
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ""}`;

  try {
    const result = await runAgentRecord({}, cwd, "scout", "hello", false, undefined, 0);
    assert.equal(result.ok, true);
  } finally {
    process.env.PATH = originalPath;
  }

  const after = fs.readdirSync(os.tmpdir()).filter((name) => name.includes(`pi-subagent-`) && name.includes(`-${process.pid}-`));
  assert.deepEqual(
    after.filter((name) => !before.has(name)),
    [],
  );
});

test("subagent output writer writes safe relative paths inside cwd", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));

  const outPath = await writeOutput(cwd, "reports/result-{index}.md", "ok", 1);

  assert.equal(outPath, path.join(cwd, "reports", "result-2.md"));
  assert.equal(fs.readFileSync(outPath, "utf8"), "ok");
});

test("subagent output writer rejects absolute and traversal paths", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));
  const outside = path.join(os.tmpdir(), `pi-subagent-outside-${process.pid}.md`);

  await assert.rejects(() => writeOutput(cwd, outside, "nope", 0), /Output path must be relative/);
  await assert.rejects(() => writeOutput(cwd, "../escape.md", "nope", 0), /Output path must stay inside cwd/);

  assert.equal(fs.existsSync(outside), false);
  assert.equal(fs.existsSync(path.join(path.dirname(cwd), "escape.md")), false);
});

test("subagent output writer rejects protected secret paths", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));

  await assert.rejects(() => writeOutput(cwd, ".env", "SECRET=value", 0), /Protected output path denied/);
  await assert.rejects(() => writeOutput(cwd, "nested/private-key.txt", "SECRET=value", 0), /Protected output path denied/);

  assert.equal(fs.existsSync(path.join(cwd, ".env")), false);
  assert.equal(fs.existsSync(path.join(cwd, "nested", "private-key.txt")), false);
});

test("subagent output writer rejects symlink escapes inside cwd", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-outside-"));
  fs.symlinkSync(outside, path.join(cwd, "link"), "dir");

  await assert.rejects(() => writeOutput(cwd, "link/escaped.md", "nope", 0), /Output path must stay inside cwd/);

  assert.equal(fs.existsSync(path.join(outside, "escaped.md")), false);
});

test("subagent output writer rejects existing symlink output files", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-outside-"));
  const outsideFile = path.join(outside, "target.md");
  fs.writeFileSync(outsideFile, "original", "utf8");
  fs.symlinkSync(outsideFile, path.join(cwd, "out.md"));

  await assert.rejects(() => writeOutput(cwd, "out.md", "nope", 0), /Output path must stay inside cwd/);

  assert.equal(fs.readFileSync(outsideFile, "utf8"), "original");
});
