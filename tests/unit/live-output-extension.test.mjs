import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("process tool streams throttled compact live output", () => {
  const source = readText("extensions/processes/index.ts");

  assert.match(source, /createThrottledLiveUpdate\(proc, onUpdate\)/);
  assert.match(source, /setTimeout\(emit, 250\)/);
  assert.match(source, /processLiveResult\(proc, lastStream\)/);
  assert.match(source, /stdout \(live\):/);
  assert.match(source, /stderr \(live\):/);
  assert.match(source, /stdout\.slice\(-4\)/);
});

test("subagent tool streams child stdout and stderr with throttling", () => {
  const source = readText("extensions/subagents/executor.ts");

  assert.match(source, /spawnFn\("bash", \["-lc", `pi -p\$\{toolsArg\} < \$\{shellQuote\(promptFile\)\}`\]/);
  assert.match(source, /createSubagentLiveUpdate\(agent, task, index, stdout, stderr, onUpdate, redactText\)/);
  assert.match(source, /child\.stdout\.on\("data"/);
  assert.match(source, /child\.stderr\.on\("data"/);
  assert.match(source, /setTimeout\(emit, 500\)/);
  assert.match(source, /redactText\(tailText\(\[\.\.\.stdout, \.\.\.stderr\]\.join\(""\), 8, 4000\)\)/);
});
