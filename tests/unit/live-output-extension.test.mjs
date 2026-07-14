import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("process tool avoids deferred updates after detached start returns", () => {
  const source = readText("extensions/processes/index.ts");

  assert.match(source, /onUpdate\?\.\(processLiveResult\(proc, "start"\)\)/);
  assert.match(source, /appendOutput\(proc, "stdout"/);
  assert.match(source, /appendOutput\(proc, "stderr"/);
  assert.doesNotMatch(source, /createThrottledLiveUpdate\(proc, onUpdate\)/);
  assert.doesNotMatch(source, /setTimeout\(emit, 250\)/);
});

test("subagent tool streams child stdout and stderr with throttling", () => {
  const source = readText("extensions/subagents/executor.ts");

  assert.match(source, /spawnFn\("bash", \["-c", `pi -p < \$\{shellQuote\(promptFile\)\}`\]/);
  assert.match(source, /createSubagentLiveUpdate\(agent, task, index, stdout, stderr, onUpdate, redactText\)/);
  assert.match(source, /child\.stdout\.on\("data"/);
  assert.match(source, /child\.stderr\.on\("data"/);
  assert.match(source, /setTimeout\(emit, 500\)/);
  assert.match(source, /redactText\(tailText\(\[\.\.\.stdout, \.\.\.stderr\]\.join\(""\), 8, 4000\)\)/);
});
