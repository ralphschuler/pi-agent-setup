import assert from "node:assert/strict";
import test from "node:test";

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
